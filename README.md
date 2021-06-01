
<p align="center">

<img src="https://camo.githubusercontent.com/02cfc066bb091bef48297865d81d7d668e72314970e13ba913864e346e12f55d/68747470733a2f2f696d616765732e74757961636e2e636f6d2f6170702f686173732f68625f747579612e706e67" width="70%">

</p>

# Homebridge Tuya SmartHome
A slighlty better version of the [Official Tuya Homebridge](https://github.com/tuya/tuya-homebridge) plugin.

**Note:** I use this for my personal setup but feel free to contribute :)

## Supported Devices
- [Light](src/lightDevice.ts)

## Installation

1. See [Tuya Setup Guide](https://developer.tuya.com/en/docs/iot/Platform_Configuration_smarthome?id=Kamcgamwoevrx) to get started. 
2. Visit [Homebridge](https://github.com/homebridge/homebridge) documentation.
  I recommend you use the Configuration UI. But just incase:
    ```json
    {
        "options": {
            "username": "smartuser@email.com",
            "password": "<password>",
            "clientId": "<client-id>",
            "clientSecret": "<client-secret>",
            "baseUrl": "https://openapi.tuyaus.com",
            "schema": "tuyaSmart",
            "countryCode": 63
        },
        "platform": "TuyaSmartHome"
    }
    ```

## Credits
- [Tuya Homebridge](https://github.com/tuya/tuya-homebridge) - Copy & Pasted some core codes