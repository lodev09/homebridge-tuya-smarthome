import mqtt from 'mqtt';
import Crypto from 'crypto-js';

import { Platform } from './platform';

export class TuyaLink {
  private client;
  private config;
  private listeners;
  private connected = false;

  constructor(private readonly platform: Platform) {
    this.listeners = new Set();
  }

  debug(message: string) {
    const name = '[MQTT]';
    this.platform.log.debug(name, message);
  }

  connect(config) {
    if (!config) {
      this.platform.log.error('MQTT config is not valid');
      return;
    }

    this.config = config;

    if (this.client && this.connected === true) {
      this.client.end();
    }

    this.client = mqtt.connect(this.config.url, {
      clientId: this.config.client_id,
      username: this.config.username,
      password: this.config.password,
    });

    this.client.subscribe(this.config.source_topic.device);

    this.client.on('connect', () => {
      this.connected = true;
      this.platform.log.info('[MQTT] connected');
    });

    this.client.on('disconnect', () => {
      this.connected = false;
      this.platform.log.info('[MQTT] disconnected');
    });

    this.client.on('offline', () => {
      this.connected = false;
      this.platform.log.info('[MQTT] offline');
    });

    this.client.on('error', (err) => {
      this.connected = false;
      this.platform.log.error('[MQTT] ERROR:', err);
    });

    this.client.on('end', () => {
      this.connected = false;
      this.platform.log.info('[MQTT] terminated');
    });

    this.client.on('message', this.onMessage.bind(this));
  }

  async onMessage(topic, payload) {
    const message = JSON.parse(payload.toString());
    const password = this.config.password.substring(8, 24);

    const rawData = Crypto.AES.decrypt(message.data, Crypto.enc.Utf8.parse(password), {
      mode: Crypto.mode.ECB,
      padding: Crypto.pad.Pkcs7,
    }).toString(Crypto.enc.Utf8);

    const data = JSON.parse(rawData) || null;

    for (const listener of this.listeners.values()) {
      if (this.config.source_topic.device === topic) {
        this.platform.log.debug('[LINK]', rawData);
        await listener(data);
      }
    }
  }

  addListener(callback) {
    this.listeners.add(callback);
  }

  removeListener(callback) {
    this.listeners.delete(callback);
  }
}