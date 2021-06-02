import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { LightDevice } from './lightDevice';
import { Device } from './device';
import { TuyaApi } from './tuyaApi';

export class Platform implements DynamicPlatformPlugin {

  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: Map<string, PlatformAccessory>;
  public readonly devices: Map<string, Device>;
  public readonly tuyaApi: TuyaApi;

  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    this.log.debug('Finished initializing platform:', this.config.platform);

    this.accessories = new Map();
    this.devices = new Map();
    this.tuyaApi = new TuyaApi(this);

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Configuring cached accessory:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  async discoverDevices() {
    const authenticated = await this.tuyaApi.initAuth();
    if (authenticated) {
      // Init link (mqtt)
      const link = await this.tuyaApi.getLink();
      if (link) {
        link.addListener(this.onLinkUpdate.bind(this));
      }

      const devices = await this.tuyaApi.getDevices();
      for (const deviceInfo of devices) {

        const uuid = this.api.hap.uuid.generate(deviceInfo.id);
        const accessory = this.getAccessory(uuid);

        if (accessory) {
          // the accessory already exists
          this.log.info('Restoring existing accessory from cache:', accessory.displayName);

          await this.initDeviceAccessory(deviceInfo, accessory);
          this.api.updatePlatformAccessories([accessory]);

        } else {
          await this.addDevice(deviceInfo);
        }
      }
    } else {
      this.log.error('Failed to authentcate API');

      // Add accessories from cache instead
      for (const accessory of this.accessories.values()) {
        await this.initDeviceAccessory(accessory.context.device, accessory);
      }
    }
  }

  getAccessory(uuid) {
    return this.accessories.get(uuid);
  }

  async addDevice(deviceInfo) {
    const uuid = this.api.hap.uuid.generate(deviceInfo.id);

    // the accessory does not yet exist, so we need to create it
    this.log.info('Adding new device accessory:', deviceInfo.name);

    const accessory = new this.api.platformAccessory(deviceInfo.name, uuid);

    // Create the device and initialize functions
    const device = await this.initDeviceAccessory(deviceInfo, accessory);
    if (device) {
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.configureAccessory(accessory);
    }
  }

  async onLinkUpdate(data){
    if (!data) {
      return;
    }

    if (data.bizCode){
      if (data.bizCode === 'delete') {

        const uuid = this.api.hap.uuid.generate(data.devId);
        this.removeDevice(uuid);

      } else if (data.bizCode === 'bindUser') {

        const uuid = this.api.hap.uuid.generate(data.devId);
        const deviceInfo = await this.tuyaApi.getDevice(data.devId);

        // if accessory was previouslly in the cache
        const existingAccessory = this.getAccessory(uuid);
        if (existingAccessory) {

          await this.initDeviceAccessory(deviceInfo, existingAccessory);
          this.api.updatePlatformAccessories([existingAccessory]);

        } else {
          await this.addDevice(deviceInfo);
        }
      }

    } else {

      const uuid = this.api.hap.uuid.generate(data.devId);
      const device = this.devices.get(uuid);

      if (device) {
        this.log.info('Refreshing device: ' + device.getName());

        const codeValues = {};
        for (const s of data.status) {
          let rawValue;
          if (typeof s.value === 'string') {
            try {
              rawValue = JSON.parse(s.value);
            } catch (e) {
              rawValue = s.value;
            }
          } else {
            rawValue = s.value;
          }

          codeValues[s.code] = rawValue;
        }

        device.setValues(codeValues, false);
        this.api.updatePlatformAccessories([device.accessory]);
      }
    }
  }

  removeDevice(uuid) {
    const accessory = this.getAccessory(uuid);
    if (accessory) {
      this.log.info('Removing existing accessory from cache: ', accessory.displayName);

      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.delete(accessory.UUID);
    }
  }

  async initDeviceAccessory(deviceInfo, accessory: PlatformAccessory): Promise<Device> {
    let device;

    accessory.context.info = deviceInfo;

    switch (deviceInfo.category) {
      case 'dj':
      case 'dd':
      case 'fwd': {

        if (this.devices.has(accessory.UUID) === false) {
          device = new LightDevice(this, accessory);
          this.devices.set(accessory.UUID, device);
        }

        await device.init();
        break;
      }

      default:
        this.log.info('Device "' + deviceInfo.category + '" is not supported yet.');
        break;
    }

    return device;
  }
}
