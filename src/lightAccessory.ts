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

  async setBrightness(value: CharacteristicValue) {
    let code;
    let rawValue;

    value = value as number;

    const workMode = this.getCodeValue('work_mode');
    if (workMode === 'white') {
      code = 'bright_value, bright_value_v2';

      // Convert to raw
      const values = this.getFunctionValues(code);
      rawValue = Math.max(Math.min((value / 100) * values.max, values.max), values.min);

    } else {
      code = 'colour_data, colour_data_v2';

      // Convert to raw
      const func = this.getFunction(code);
      const max = func.code === 'colour_data' ? 255 : 1000;
      const v = Math.min((value / 100) * max, max);

      rawValue = this.getCodeValue(code);
      rawValue.v = v;
    }

    this.platform.log.debug('Set Brightness ' + value);
    await this.setValue(code, rawValue);
  }

  async getBrightness(): Promise<CharacteristicValue> {
    let value;

    const workMode = this.getCodeValue('work_mode');
    if (workMode === 'white') {
      const code = 'bright_value, bright_value_v2';
      const rawValue = this.getCodeValue(code) as number;

      // Convert to percent
      const values = this.getFunctionValues(code);
      value = Math.min((rawValue / values.max) * 100, 100);

      this.platform.log.debug(this.accessory.context.device.id + ' B: ' + value + ' (' + rawValue + ')');

    } else {
      const code = 'colour_data, colour_data_v2';
      const rawValue = this.getCodeValue(code);

      const func = this.getFunction(code);
      const max = func.code === 'colour_data' ? 255 : 1000;

      // max: 100%
      value = Math.min((rawValue.v / max) * 100, 100);

      this.platform.log.debug(this.accessory.context.device.id + ' V: ' + value + ' (' + rawValue.v + ')');
    }

    return value;
  }

  async setSaturation(value: CharacteristicValue) {
    const code = 'colour_data, colour_data_v2';
    value = value as number;

    // Convert to raw
    const func = this.getFunction(code);
    const max = func.code === 'colour_data' ? 255 : 1000;
    const s = Math.min((value / 100) * max, max);

    const rawValue = this.getCodeValue(code);
    rawValue.s = s;

    this.platform.log.debug('Set Saturation ' + value);

    // just set state
    // let Hue run the command

    await this.setValues({ work_mode: 'colour', [code]: rawValue }, false);
  }

  async getSaturation(): Promise<CharacteristicValue> {
    const code = 'colour_data, colour_data_v2';

    const rawValue = this.getCodeValue(code);

    const func = this.getFunction(code);
    const max = func.code === 'colour_data' ? 255 : 1000;

    // max: 100%
    const value = Math.min((rawValue.s / max) * 100, 100);
    this.platform.log.debug(this.accessory.context.device.id + ' S: ' + value + ' (' + rawValue.s + ')');

    return value;
  }

  async setHue(value: CharacteristicValue) {
    const code = 'colour_data, colour_data_v2';
    value = value as number;

    // Convert to raw
    const h = Math.min((value / 360) * 360, 360);

    const rawValue = this.getCodeValue(code);
    rawValue.h = h;

    this.platform.log.debug('Set Hue ' + value);

    // Check if white
    if (rawValue.h < 10 && rawValue.s < 10) {
      const brightValues = this.getFunctionValues('bright_value, bright_value_v2');
      const tempValues = this.getFunctionValues('temp_value, temp_value_v2');

      await this.setValues({
        'work_mode': 'white',
        'bright_value, bright_value_v2': brightValues.max,
        'temp_value, temp_value_v2': tempValues.max,
      });

    } else {
      await this.setValues({ work_mode: 'colour', [code]: rawValue });
    }
  }

  async getHue(): Promise<CharacteristicValue> {
    const rawValue = this.getCodeValue('colour_data, colour_data_v2');

    // max: 360
    const value = Math.min((rawValue.h / 360) * 360, 360);
    this.platform.log.debug(this.accessory.context.device.id + ' H: ' + value + ' (' + rawValue.h + ')');

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
    const rawValue = Math.floor(values.max - (Math.min(((value - 140) / 360) * values.max, values.max)));

    this.platform.log.debug('Set Temp ' + value);

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

    const value = Math.floor(Math.max(Math.min(500 - ((rawValue / values.max) * 360), 500), 140));
    this.platform.log.debug(this.accessory.context.device.id + ' T: ' + value + ' (' + rawValue + ')');

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
