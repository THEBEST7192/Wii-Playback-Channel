export class Wiimote {
  constructor(device) {
    this.device = device;
    this.buttons = {
      LEFT: false,
      RIGHT: false,
      DOWN: false,
      UP: false,
      PLUS: false,
      TWO: false,
      ONE: false,
      B: false,
      A: false,
      MINUS: false,
      HOME: false,
    };
    this.onButtonUpdate = null;
    this.extensionInitInProgress = false;
    this.extensionConnected = false;
    this.statusPollInterval = null;
  }

  async init() {
    console.log('Wiimote init start', { productName: this.device?.productName });
    if (!this.device.opened) {
      await this.device.open();
    }
    console.log('Wiimote device opened', { opened: this.device.opened });

    this.device.addEventListener('inputreport', (event) => {
      this.handleInputReport(event);
    });

    // 0. Set Player 1 LED to indicate connection
    await this.setLEDs(true, false, false, false);

    // 1. Initialize IR Camera
    await this.initIR();

    // 2. Set reporting mode to include buttons, accel, and IR
    // Report Mode 0x33: Buttons, Accel, IR
    // We use 0x04 flag for Continuous Reporting
    await this.setReportMode(0x33);

    // 3. Request Status (to verify connection and check for extensions)
    await this.requestStatus();
    await this._tryInitNunchuk('startup');
    this._startStatusPolling();
    console.log('Wiimote init complete');
  }

  async _tryInitNunchuk(reason) {
    if (this.extensionInitInProgress) {
      return;
    }
    this.extensionInitInProgress = true;
    try {
      console.log('Wiimote init nunchuk', { reason });
      await this._initNunchuk();
    } catch (error) {
      console.warn('Wiimote init nunchuk failed', { reason, error: error?.message ?? String(error) });
    } finally {
      this.extensionInitInProgress = false;
    }
  }

  async _initNunchuk() {
    // 1. Initialize Extension
    await this.initExtension();

    // 2. Set data reporting mode to include extension data
    await this.setReportMode(0x35);
  }

  async setLEDs(led1, led2, led3, led4) {
    let val = 0;
    if (led1) val |= 0x10;
    if (led2) val |= 0x20;
    if (led3) val |= 0x40;
    if (led4) val |= 0x80;
    // Report 0x11: Set LEDs
    await this.device.sendReport(0x11, new Uint8Array([val]));
  }

  async requestStatus() {
    // Report 0x15: Status Request
    console.log('Wiimote request status');
    await this.device.sendReport(0x15, new Uint8Array([0x00]));
  }

  async initExtension() {
    // 1. Write 0x55 to 0xa400f0
    // [Flags, Offset_High, Offset_Mid, Offset_Low, Size, ...Data]
    console.log('Wiimote init extension start');
    const rpt1 = new Uint8Array([0x04, 0xa4, 0x00, 0xf0, 0x01, 0x55]);
    await this.device.sendReport(0x16, rpt1);

    // 2. Write 0x00 to 0xa400fb
    const rpt2 = new Uint8Array([0x04, 0xa4, 0x00, 0xfb, 0x01, 0x00]);
    await this.device.sendReport(0x16, rpt2);
    console.log('Wiimote init extension done');
  }

  async initIR() {
    // 1. Enable IR Logic: Report 0x13 with value 0x04
    await this.device.sendReport(0x13, new Uint8Array([0x04]));
    // 2. Enable IR Logic 2: Report 0x1a with value 0x04
    await this.device.sendReport(0x1a, new Uint8Array([0x04]));

    // 3. Write Sensitivity to 0x04b000 through 0x04b008
    const sensitivity = new Uint8Array([
      0x04, 0x04, 0xb0, 0x00, 0x09, // Flags, Offset, Size
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x90, 0x00, 0xc0, // Data
    ]);
    await this.device.sendReport(0x16, sensitivity);

    // 4. Set IR Mode: Write to 0x04b033
    // 0x01: Basic
    const irMode = new Uint8Array([0x04, 0x04, 0xb0, 0x33, 0x01, 0x01]);
    await this.device.sendReport(0x16, irMode);
  }

  async setReportMode(mode) {
    // Report 0x12: Set reporting mode
    // [0x12, Continuous_Reporting (0x04), Mode]
    console.log('Wiimote set report mode', { mode });
    await this.device.sendReport(0x12, new Uint8Array([0x04, mode]));
  }

  _startStatusPolling() {
    if (this.statusPollInterval) {
      return;
    }
    this.statusPollInterval = setInterval(() => {
      this.requestStatus();
    }, 1500);
  }

  handleInputReport(event) {
    const { data, reportId } = event;

    // Status report
    if (reportId === 0x20) {
      const status2 = data.getUint8(2);
      const status3 = data.getUint8(3);
      const extensionConnected = Boolean((status3 & 0x02) || (status2 & 0x02));
      this.extensionConnected = extensionConnected;
      console.log('Wiimote status report', { extensionConnected, status2, status3 });
      if (extensionConnected) {
        this._tryInitNunchuk('status');
      } else {
        this.setReportMode(0x33);
      }
      if (this.onButtonUpdate) {
        this.onButtonUpdate(this.buttons, event);
      }
      return;
    }

    const view = data; // event.data is already a DataView in WebHID

    // Standard reports (0x30 and above) contain buttons in the first two bytes
    // Byte 0: [Left, Right, Down, Up, Plus, 0, 0, Unknown]
    // Byte 1: [Two, One, B, A, Minus, 0, 0, Home]

    const b1 = view.getUint8(0);
    const b2 = view.getUint8(1);

    this.buttons = {
      LEFT: (b1 & 0x01) !== 0,
      RIGHT: (b1 & 0x02) !== 0,
      DOWN: (b1 & 0x04) !== 0,
      UP: (b1 & 0x08) !== 0,
      PLUS: (b1 & 0x10) !== 0,
      TWO: (b2 & 0x01) !== 0,
      ONE: (b2 & 0x02) !== 0,
      B: (b2 & 0x04) !== 0,
      A: (b2 & 0x08) !== 0,
      MINUS: (b2 & 0x10) !== 0,
      HOME: (b2 & 0x80) !== 0,
    };

    if (this.onButtonUpdate) {
      this.onButtonUpdate(this.buttons, event);
    }
  }
}
