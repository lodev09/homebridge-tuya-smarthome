import Crypto from 'crypto-js';
import axios from 'axios';
import { v1 as uuidv1 } from 'uuid';

import { LANG, LINK_TYPE } from './settings';
import { Platform } from './platform';
import { TuyaLink } from './tuyaLink';

export class TuyaApi {
  public link: TuyaLink;

  private auth = {
    access_token: '',
    refresh_token: '',
    uid: '',
    expire: 0,
  };

  private requestHash = '';
  private requestResult;

  constructor(private readonly platform: Platform) {
    this.link = new TuyaLink(platform);
  }

  isAuthenticated(): boolean {
    return this.auth.uid !== ''
      && this.auth.access_token !== ''
      && this.auth.expire - 60 > new Date().getTime()
    ;
  }

  async initAuth(): Promise<boolean> {
    if (this.auth.expire - 60 > new Date().getTime()) {
      return true;
    }

    this.platform.log.info('Authenticating Tuya API');
    const options = this.platform.config.options;

    const result = await this.request('post', '/v1.0/iot-01/associated-users/actions/authorized-login', null, {
      'country_code' : options.countryCode,
      'username': options.username,
      'password': Crypto.MD5(options.password).toString(),
      'schema' : options.schema,
    });

    if (result) {

      this.auth = {
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        uid: result.uid,
        expire: (result.expire_time * 1000) + new Date().getTime(),
      };

      // Refresh link
      await this.initLink();

      return true;
    }

    return false;
  }

  getSignature() {
    const options = this.platform.config.options;

    const timestamp = new Date().getTime();
    const message = options.clientId + this.auth.access_token + `${timestamp}`;
    const hash = Crypto.HmacSHA256(message, options.clientSecret);

    return hash.toString().toUpperCase();
  }

  async request(method, path, params, body) {
    const jsonBody = JSON.stringify(body);
    const jsonParams = JSON.stringify(params);

    const requestHash = Crypto.SHA1(path + jsonParams + jsonBody).toString();

    //
    // Avoid duplicate call
    // Call when previous result is empty (errored or new) or path is auth
    //

    if (this.requestHash !== requestHash || !this.requestResult) {
      // Store current request hash
      this.requestHash = requestHash;

      const options = this.platform.config.options;
      const headers = {
        't': new Date().getTime(),
        'client_id': options.clientId,
        'sign': this.getSignature(),
        'sign_method': 'HMAC-SHA256',
        'access_token': this.auth.access_token,
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

      if (response && response.data) {
        this.platform.log.debug('RESPONSE:', JSON.stringify(response.data));

        if (response.data.success !== true) {
          switch (response.data.code) {

            // Token expired
            case 1010: {

              // If for some reason api thinks the toke has expired
              // Try to renew next time

              this.platform.log.warn('WARN ' + response.data.code + ': The token expired');

              this.auth = {
                access_token: '',
                refresh_token: '',
                uid: '',
                expire: 0,
              };

              break;
            }

            default:
              this.platform.log.error('ERR ' + response.data.code + ': ' + response.data.msg);
              break;
          }

          return;
        }

        // Store request if only successful
        this.requestResult = response.data.result;

      } else {
        this.platform.log.error('RESPONSE ERR:', response);
      }
    }

    return this.requestResult;
  }

  async get(path, params = null) {
    this.platform.log.debug('[GET]', path);
    this.platform.log.debug('[GET] PARAMS:', JSON.stringify(params));

    if (this.isAuthenticated() === false) {
      this.platform.log.error('[GET] API is not authenticated');
      await this.initAuth();
    }

    return this.request('get', path, params, null);
  }

  async post(path, params) {
    this.platform.log.debug('[POST]', path);
    this.platform.log.debug('[POST] PARAMS:', JSON.stringify(params));

    if (this.isAuthenticated() === false) {
      this.platform.log.error('[GET] API is not authenticated');
      await this.initAuth();
    }

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

  async initLink() {
    if (this.isAuthenticated() === false) {
      this.platform.log.error('[LINK] API is not authenticated');
      return;
    }

    const config = await this.post('/v1.0/iot-03/open-hub/access-config', {
      'uid': this.auth.uid,
      'link_id': uuidv1(),
      'link_type': LINK_TYPE,
      'topics': 'device',
      'msg_encrypted_version': '1.0',
    });

    this.link.connect(config);
  }
}