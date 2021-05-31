import { PlatformAccessory, CharacteristicValue } from 'homebridge';

import { Platform } from './platform';
import { Accessory } from './accessory';

export class LightAccessory extends Accessory {

  constructor(platform: Platform, accessory: PlatformAccessory) {
    super(platform, accessory, platform.Service.Lightbulb);
  }

  async init() {
    await this.initFunctions();

    this.initCharacteristic(
      this.platform.Characteristic.On,
      ['switch_led'],
      this.setOn.bind(this),
      this.getOn.bind(this),
    );

    this.initCharacteristic(
      this.platform.Characteristic.Brightness,
      ['bright_value', 'bright_value_v2'],
      this.setBrightness.bind(this),
      this.getBrightness.bind(this),
    );

    this.initCharacteristic(
      this.platform.Characteristic.ColorTemperature,
      ['temp_value', 'temp_value_v2'],
      this.setColorTemperature.bind(this),
      this.getColorTemperature.bind(this),
    );

    this.initCharacteristic(
      this.platform.Characteristic.Hue,
      ['colour_data', 'colour_data_v2'],
      this.setHue.bind(this),
      this.getHue.bind(this),
    );

    this.initCharacteristic(
      this.platform.Characteristic.Saturation,
      ['colour_data', 'colour_data_v2'],
      this.setSaturation.bind(this),
      this.getSaturation.bind(this),
    );
  }

  async setBrightness(value: CharacteristicValue) {
    let codes;
    let rawValue;

    value = value as number;

    const workMode = this.getCodeValue(['work_mode']);
    if (workMode === 'white') {
      codes = ['bright_value', 'bright_value_v2'];

      // Convert to raw
      const values = this.getFunctionValuesByCodes(codes);
      rawValue = Math.max(Math.min((value / 100) * values.max, values.max), values.min);

    } else {
      codes = ['colour_data', 'colour_data_v2'];

      // Convert to raw
      const func = this.getFunctionByCodes(codes);
      const max = func.code === 'colour_data' ? 255 : 1000;
      const v = Math.min((value / 100) * max, max);

      rawValue = this.getCodeValue(codes);
      rawValue.v = v;
    }

    this.platform.log.debug('Set Brightness ' + value);
    await this.setCodeValue(codes, rawValue);
  }

  async getBrightness(): Promise<CharacteristicValue> {
    let value;

    const workMode = this.getCodeValue(['work_mode']);
    if (workMode === 'white') {
      const codes = ['bright_value', 'bright_value_v2'];
      const rawValue = this.getCodeValue(codes) as number;

      // Convert to percent
      const values = this.getFunctionValuesByCodes(codes);
      value = Math.min((rawValue / values.max) * 100, 100);

      this.platform.log.debug(this.accessory.context.device.id + ' B: ' + value + ' (' + rawValue + ')');

    } else {
      const codes = ['colour_data', 'colour_data_v2'];
      const rawValue = this.getCodeValue(codes);

      const func = this.getFunctionByCodes(codes);
      const max = func.code === 'colour_data' ? 255 : 1000;

      // max: 100%
      value = Math.min((rawValue.v / max) * 100, 100);

      this.platform.log.debug(this.accessory.context.device.id + ' V: ' + value + ' (' + rawValue.v + ')');
    }

    return value;
  }

  async setSaturation(value: CharacteristicValue) {
    const codes = ['colour_data', 'colour_data_v2'];
    value = value as number;

    // Convert to raw
    const func = this.getFunctionByCodes(codes);
    const max = func.code === 'colour_data' ? 255 : 1000;
    const s = Math.min((value / 100) * max, max);

    const rawValue = this.getCodeValue(codes);
    rawValue.s = s;

    this.platform.log.debug('Set Saturation ' + value);

    // just set state
    // let Hue run the command
    await this.setCodeValue(['work_mode'], 'colour', false);
    await this.setCodeValue(codes, rawValue, false);
  }

  async getSaturation(): Promise<CharacteristicValue> {
    const codes = ['colour_data', 'colour_data_v2'];

    const rawValue = this.getCodeValue(codes);

    const func = this.getFunctionByCodes(codes);
    const max = func.code === 'colour_data' ? 255 : 1000;

    // max: 100%
    const value = Math.min((rawValue.s / max) * 100, 100);
    this.platform.log.debug(this.accessory.context.device.id + ' S: ' + value + ' (' + rawValue.s + ')');

    return value;
  }

  async setHue(value: CharacteristicValue) {
    const codes = ['colour_data', 'colour_data_v2'];
    value = value as number;

    // Convert to raw
    const h = Math.min((value / 360) * 360, 360);

    const rawValue = this.getCodeValue(codes);
    rawValue.h = h;

    this.platform.log.debug('Set Hue ' + value);

    await this.setCodeValue(['work_mode'], 'colour', false);
    await this.setCodeValue(codes, rawValue);
  }

  async getHue(): Promise<CharacteristicValue> {
    const codes = ['colour_data', 'colour_data_v2'];

    const rawValue = this.getCodeValue(codes);

    // max: 360
    const value = Math.min((rawValue.h / 360) * 360, 360);
    this.platform.log.debug(this.accessory.context.device.id + ' H: ' + value + ' (' + rawValue.h + ')');

    return value;
  }

  async setColorTemperature(value: CharacteristicValue) {
    value = value as number;
    const codes = ['temp_value', 'temp_value_v2'];

    // Convert to raw
    const values = this.getFunctionValuesByCodes(codes);
    const rawValue = values.max - (Math.min((value / 360) * values.max, values.max));

    this.platform.log.debug('Set Temp ' + value);

    // Switch to workmode white
    // await this.setCodeValue(['work_mode'], 'white');
    await this.setCodeValue(codes, rawValue);
  }

  async getColorTemperature(): Promise<CharacteristicValue> {
    const codes = ['temp_value', 'temp_value_v2'];
    const rawValue = this.getCodeValue(codes) as number;

    const values = this.getFunctionValuesByCodes(codes);

    // min: 140
    // max: 500
    const value = Math.floor(Math.max(Math.min(360 - ((rawValue / values.max) * 360), 360), 140));
    this.platform.log.debug(this.accessory.context.device.id + ' T: ' + value + ' (' + rawValue + ')');

    return value;
  }

  async setOn(value: CharacteristicValue) {
    const rawValue = value as boolean;

    await this.setCodeValue(['switch_led'], rawValue);
  }

  async getOn(): Promise<CharacteristicValue> {
    const value = this.getCodeValue(['switch_led']) as boolean;
    return value;
  }
}
