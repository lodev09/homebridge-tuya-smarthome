import { Service, PlatformAccessory } from 'homebridge';

import { Platform } from './platform';

export class Device {

  protected service: Service;
  protected data;

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

    this.data = new Map();
  }

  getName() {
    return this.accessory.context.device.name;
  }

  log(message: string) {
    const name = '[' + this.getName() + ']';
    this.platform.log.debug(name, message);
  }

  async initFunctions() {
    if (this.accessory.context.functions) {
      return;
    }

    this.accessory.context.functions = await this.platform.tuyaApi.getDeviceFunctions(this.accessory.context.device.id);
  }

  getFunction(code: string) {
    const codes = code.split(',').map(c => c.trim());
    const functions = this.accessory.context.functions || [];

    // Check if characteristic is supported
    for (const func of functions) {
      if (codes.includes(func.code)) {
        return func;
      }
    }
  }

  getFunctionValues(code: string) {
    const func = this.getFunction(code);
    return JSON.parse(func.values);
  }

  initCharacteristic(characteristic, code: string, set, get) {
    // Check if characteristic is supported
    if (this.getFunction(code)) {
      return this.service.getCharacteristic(characteristic)
        .onSet(set)
        .onGet(get);
    }
  }

  /**
   * Get code value
   * Note: this will store RAW value
   */
  getCodeValue(code: string) {
    let statusCode;
    let statusValue;

    const codes = code.split(',').map(c => c.trim());
    const status = this.accessory.context.device.status || [];

    for (const s of status) {
      if (codes.includes(s.code)) {
        statusCode = s.code;
        statusValue = s.value;
        break;
      }
    }

    if (this.data.has(statusCode) === false) {
      // Initialize state from status

      let rawValue;
      if (typeof statusValue === 'string') {
        try {
          rawValue = JSON.parse(statusValue);
        } catch (e) {
          rawValue = statusValue;
        }
      } else {
        rawValue = statusValue;
      }

      this.data.set(statusCode, rawValue);
    }

    return this.data.get(statusCode);
  }

  async setValues(codeValues, runCommand = true) {
    const commands: unknown[] = [];

    for (const code in codeValues) {
      const rawValue = codeValues[code];

      // Check if code is supported
      const func = this.getFunction(code);
      if (func) {
        commands.push({
          code: func.code,
          value: rawValue,
        });

        this.data.set(func.code, rawValue);
      }
    }

    if (commands.length > 0 && runCommand === true) {
      await this.platform.tuyaApi.runCommand(this.accessory.context.device.id, commands);
    }
  }

  /**
   * Set code value
   * Note: this will store RAW value
   */
  async setValue(code: string, rawValue, runCommand = true) {
    const codeValues = {};
    codeValues[code] = rawValue;

    this.setValues(codeValues, runCommand);
  }
}