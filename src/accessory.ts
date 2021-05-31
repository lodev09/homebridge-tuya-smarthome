import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { Platform } from './platform';

export class Accessory {

  protected service: Service;
  protected state: Map<any, any>;

  constructor(protected readonly platform: Platform, protected readonly accessory: PlatformAccessory, service) {
    const device = accessory.context.device;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Tuya Lights')
      .setCharacteristic(this.platform.Characteristic.Model, device.product_name)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.product_id);

    this.service = this.accessory.getService(service) || this.accessory.addService(service);

    // Set accessory name
    this.service.setCharacteristic(this.platform.Characteristic.Name, device.name);

    this.state = new Map();
  }

  async initFunctions() {
    if (this.accessory.context.functions) return;
    this.accessory.context.functions = await this.platform.tuyaApi.getDeviceFunctions(this.accessory.context.device.id);
  }

  getFunctionByCodes(codes: string[]) {
    const functions = this.accessory.context.functions || [];

    // Check if characteristic is supported
    for (const func of functions) {
      if (codes.includes(func.code)) {
        return func;
      }
    }
  }

  getFunctionValuesByCodes(codes: string[]) {
    const func = this.getFunctionByCodes(codes);
    return JSON.parse(func.values);
  }

  initCharacteristic(characteristic, codes: string[], set, get) {
    // Check if characteristic is supported
    if (this.getFunctionByCodes(codes)) {
      return this.service.getCharacteristic(characteristic)
        .onSet(set)
        .onGet(get);
    }
  }

  /**
   * Get code value
   * Note: this will store RAW value
   */
  getCodeValue(codes: string[]) {
    let code;
    let value;

    const status = this.accessory.context.device.status || [];

    for (const s of status) {
      if (codes.includes(s.code)) {
        code = s.code;
        value = s.value;
        break;
      }
    }

    if (this.state.has(code) === false) {
      // Initialize state from status

      let rawValue;
      if (typeof value === 'string') {
        try {
          rawValue = JSON.parse(value);
        } catch (e) {
          rawValue = value;
        }
      } else {
        rawValue = value;
      }

      this.state.set(code, rawValue)
    }

    return this.state.get(code);
  }

  /**
   * Set code value
   * Note: this will store RAW value
   */
  async setCodeValue(codes: string[], rawValue: any, runCommand: boolean = true) {
    // Check if code is supported
    const func = this.getFunctionByCodes(codes);
    if (func) {

      if (runCommand === true) {
        let commands = [
          {
            code: func.code,
            value: rawValue
          }
        ];

        await this.platform.tuyaApi.runCommand(this.accessory.context.device.id, {
          commands: commands
        });
      }

      this.state.set(func.code, rawValue)
    }
  }
}