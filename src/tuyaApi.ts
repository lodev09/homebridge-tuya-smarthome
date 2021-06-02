import Crypto from 'crypto-js';
import axios from 'axios';
import { v1 as uuidv1 } from 'uuid';

import { LANG, LINK_TYPE } from './settings';
import { Platform } from './platform';
import { TuyaLink } from './tuyaLink';

export class TuyaApi {
  private authPath = '/v1.0/iot-01/associated-users/actions/authorized-login';

  private tokenInfo = {
    access_token: '',
    refresh_token: '',
    uid: '',
    expire: 0,
  };

  private requestHash = '';
  private requestResult;

  constructor(private readonly platform: Platform) { }

  async initAuth() {
    return await this.setTokenInfo();
  }

  async setTokenInfo(path = ''): Promise<boolean> {
    if (path === this.authPath) {
      return true;
    }

    if ((this.tokenInfo.expire - 60) * 1000 > new Date().getTime()) {
      return true;
    }

    const options = this.platform.config.options;

    const result = await this.post(this.authPath, {
      'country_code' : options.countryCode,
      'username': options.username,
      'password': Crypto.MD5(options.password).toString(),
      'schema' : options.schema,
    });

    if (result) {
      this.tokenInfo = {
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        uid: result.uid,
        expire: (result.expire_time * 1000) + new Date().getTime(),
      };

      return true;
    }

    return false;
  }

  getSignature() {
    const options = this.platform.config.options;

    const timestamp = new Date().getTime();
    const message = options.clientId + this.tokenInfo.access_token + `${timestamp}`;
    const hash = Crypto.HmacSHA256(message, options.clientSecret);

    return hash.toString().toUpperCase();
  }

  async request(method, path, params = null, body = null) {
    await this.setTokenInfo(path);

    if (path !== this.authPath && this.tokenInfo.access_token === '') {
      this.platform.log.error('API is not authenticated');
      return;
    }

    const jsonBody = JSON.stringify(body);
    const jsonParams = JSON.stringify(params);

    const requestHash = Crypto.SHA1(path + jsonParams + jsonBody).toString();

    // Avoid duplicate call
    if (this.requestHash !== requestHash) {

      // Store current request hash
      this.requestHash = requestHash;

      const logMethod = '[' + method.toUpperCase() + ']';
      this.platform.log.info(logMethod + path);
      if (body) {
        this.platform.log.info(logMethod + ' BODY:', jsonBody);
      }

      if (params) {
        this.platform.log.info(logMethod + ' PARAMS:', jsonParams);
      }

      const options = this.platform.config.options;
      const headers = {
        't': new Date().getTime(),
        'client_id': options.clientId,
        'sign': this.getSignature(),
        'sign_method': 'HMAC-SHA256',
        'access_token': this.tokenInfo.access_token,
        'lang': LANG,
        'dev_lang': 'javascript',
        'dev_channel': 'homebridge',
        'devVersion': '1.0.6',
      };

      const response = await axios({
        baseURL: options.baseUrl,
        url: path,
        method: method,
        headers: headers,
        params: params,
        data: body,
      });

      if (response.data) {
        if (response.data.success !== true) {
          this.platform.log.error('ERR ' + response.data.code + ': ' + response.data.msg);
          return;
        }

        // Store request if only successful
        this.requestResult = response.data.result;
      }
    }

    return this.requestResult;
  }

  async get(path, params = null) {
    return this.request('get', path, params, null);
  }

  async post(path, params) {
    return this.request('post', path, null, params);
  }

  async getDevices() {
    const result = await this.get('/v1.0/iot-01/associated-users/devices');
    return result ? result.devices : [];
  }

  async getDeviceFunctions(deviceID) {
    const result = await this.get('/v1.0/devices/' + deviceID + '/functions');
    return result ? result.functions : [];
  }

  async getDevice(deviceID) {
    const result = await this.get('/v1.0/devices/' + deviceID);
    return result ? result : {};
  }

  async runCommand(deviceID, commands) {
    const result = await this.post('/v1.0/devices/' + deviceID + '/commands', { commands: commands });
    return result;
  }

  async getLink() {
    if (this.tokenInfo.uid === '') {
      this.platform.log.error('API is not authenticated');
      return;
    }

    const result = await this.post('/v1.0/iot-03/open-hub/access-config', {
      'uid': this.tokenInfo.uid,
      'link_id': uuidv1(),
      'link_type': LINK_TYPE,
      'topics': 'device',
      'msg_encrypted_version': '1.0',
    });

    const link = new TuyaLink(this.platform, result);
    await link.connect();

    return link;
  }
}