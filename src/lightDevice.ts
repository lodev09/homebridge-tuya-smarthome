import { PlatformAccessory, CharacteristicValue } from 'homebridge';

import { Platform } from './platform';
import { Device } from './device';

export class LightDevice extends Device {

  constructor(platform: Platform, accessory: PlatformAccessory) {
    super(platform, accessory, platform.Service.Lightbulb);
  }

  async init() {
    await this.initFunctions();

    // Initialize identify event
    this.accessory.on('identify', this.onIdentify.bind(this));

    // Initialize characteristics
    this.initCharacteristic(
      this.platform.Characteristic.On,
      'switch_led',
      this.setOn.bind(this),
      this.getOn.bind(this),
    );

    this.initCharacteristic(
      this.platform.Characteristic.Brightness,
      'bright_value, bright_value_v2',
      this.setBrightness.bind(this),
      this.getBrightness.bind(this),
    );

    this.initCharacteristic(
      this.platform.Characteristic.ColorTemperature,
      'temp_value, temp_value_v2',
      this.setColorTemperature.bind(this),
      this.getColorTemperature.bind(this),
    );

    this.initCharacteristic(
      this.platform.Characteristic.Hue,
      'colour_data, colour_data_v2',
      this.setHue.bind(this),
      this.getHue.bind(this),
    );

    this.initCharacteristic(
      this.platform.Characteristic.Saturation,
      'colour_data, colour_data_v2',
      this.setSaturation.bind(this),
      this.getSaturation.bind(this),
    );
  }

  async onIdentify(): Promise<void> {
    this.debug('Identifying ' + this.getName());

    // Turn and off
    await this.setValues({ switch_led: true });
    await this.setValues({ switch_led: false });
  }

  async setBrightness(value: CharacteristicValue) {
    let code;
    let rawValue;

    value = value as number;

    const workMode = this.getCodeValue('work_mode');

    if (workMode === 'colour') {
      code = 'colour_data, colour_data_v2';

      // Convert to raw
      const func = this.getFunction(code);
      const max = func.code === 'colour_data' ? 255 : 1000;
      const min = func.code === 'colour_data' ? 25 : 10;

      let v = ((value / 100) * (max - min)) + min;
      v = Math.max(Math.min(Math.ceil(v), max), min);

      rawValue = this.getCodeValue(code);
      rawValue.v = v;

    } else {
      code = 'bright_value, bright_value_v2';

      // Convert to raw
      const values = this.getFunctionValues(code);

      rawValue = ((value / 100) * (values.max - values.min)) + values.min;
      rawValue = Math.max(Math.min(Math.ceil(rawValue), values.max), values.min);
    }

    this.debug('Set Brightness ' + value);

    await this.setValue(code, rawValue);
  }

  async getBrightness(): Promise<CharacteristicValue> {
    let value;

    const workMode = this.getCodeValue('work_mode');

    if (workMode === 'colour') {
      const code = 'colour_data, colour_data_v2';
      const rawValue = this.getCodeValue(code);
      if (typeof rawValue !== 'object') {
        return 0;
      }

      const func = this.getFunction(code);
      const max = func.code === 'colour_data' ? 255 : 1000;
      const min = func.code === 'colour_data' ? 25 : 10;

      // 0-100%
      value = (rawValue.v - min) / (max - min);
      value = Math.min(Math.ceil(value * 100), 100);

      this.debug('Get Brightness (V): ' + value + ' (' + rawValue.v + '/' + max + ')');

    } else {

      const code = 'bright_value, bright_value_v2';
      const rawValue = this.getCodeValue(code) as number;

      // Convert to percent
      const values = this.getFunctionValues(code);

      // 0-100%
      value = (rawValue - values.min) / (values.max - values.min);
      value = Math.min(Math.ceil(value * 100), 100);

      this.debug('Get Brightness: ' + value + ' (' + rawValue + '/' + values.max + ')');

    }

    return value;
  }

  async setColourData(rawValue) {
    // Check if white
    if (rawValue.s < 50) {
      const brightValues = this.getFunctionValues('bright_value, bright_value_v2');
      const tempValues = this.getFunctionValues('temp_value, temp_value_v2');

      await this.setValues({
        'work_mode': 'white',
        'bright_value, bright_value_v2': brightValues.max,
        'temp_value, temp_value_v2': tempValues.max,
      });

    } else {
      const code = 'colour_data, colour_data_v2';
      await this.setValues({ work_mode: 'colour', [code]: rawValue });
    }
  }

  async setSaturation(value: CharacteristicValue) {
    const code = 'colour_data, colour_data_v2';
    value = value as number;

    // Convert to raw
    const func = this.getFunction(code);
    const max = func.code === 'colour_data' ? 255 : 1000;
    let s = (value / 100) * max;
    s = Math.min(Math.ceil(s), max);

    const rawValue = this.getCodeValue(code);
    rawValue.s = s;

    this.debug('Set Saturation ' + value);
    await this.setColourData(rawValue);
  }

  async getSaturation(): Promise<CharacteristicValue> {
    const code = 'colour_data, colour_data_v2';

    const rawValue = this.getCodeValue(code);
    if (typeof rawValue !== 'object') {
      return 0;
    }

    const func = this.getFunction(code);
    const max = func.code === 'colour_data' ? 255 : 1000;

    // max: 100%
    let value = (rawValue.s / max) * 100;
    value = Math.min(Math.ceil(value), 100);

    this.debug('Get Saturation: ' + value + ' (' + rawValue.s + '/' + max + ')');

    return value;
  }

  async setHue(value: CharacteristicValue) {
    const code = 'colour_data, colour_data_v2';
    value = value as number;

    // homekit hue = tuya hue (360)
    const rawValue = this.getCodeValue(code);
    rawValue.h = value;

    this.debug('Set Hue ' + value);
    await this.setColourData(rawValue);
  }

  async getHue(): Promise<CharacteristicValue> {
    const rawValue = this.getCodeValue('colour_data, colour_data_v2');
    if (typeof rawValue !== 'object') {
      return 0;
    }

    // homekit hue = tuya hue (360)
    const value = rawValue.h;

    this.debug('Get Hue: ' + value + ' (' + rawValue.h + '/360)');

    return value;
  }

  async setColorTemperature(value: CharacteristicValue) {
    value = value as number;
    const code = 'temp_value, temp_value_v2';

    //
    // Convert to raw
    //
    // Note:
    // homekit value is opposite to tuya's value
    //

    const values = this.getFunctionValues(code);

    let rawValue = ((value / 360) * (values.max - values.min)) + values.min;
    rawValue = Math.max(Math.min(Math.ceil(values.max - rawValue), values.max), values.min);

    this.debug('Set Temp ' + value);

    // Switch to workmode white
    await this.setValues({ work_mode: 'white', [code]: rawValue });
  }

  async getColorTemperature(): Promise<CharacteristicValue> {
    const code = 'temp_value, temp_value_v2';
    const rawValue = this.getCodeValue(code) as number;

    const values = this.getFunctionValues(code);

    //
    // Note:
    // homekit value is opposite to tuya's value
    //

    let value = (rawValue - values.min) / (values.max - values.min);
    value = Math.max(Math.min(Math.ceil(500 - (value * 360)), 500), 140);

    this.debug('Get Temp: ' + value + ' (' + rawValue + '/' + values.max + ')');

    return value;
  }

  async setOn(value: CharacteristicValue) {
    const rawValue = value as boolean;

    await this.setValues({ switch_led: rawValue });
  }

  async getOn(): Promise<CharacteristicValue> {
    const value = this.getCodeValue('switch_led') as boolean;
    return value;
  }
}