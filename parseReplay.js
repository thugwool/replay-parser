// parseReplay.js (Parses a .replay file)
export async function parseReplay(file) {
    const arrayBuffer = await file.arrayBuffer();
    const data = new DataView(arrayBuffer);
    let offset = 0;
  
    function readUint8() {
      if (offset + 1 > data.byteLength)
        throw new Error(`Unexpected end of file at offset ${offset}`);
      const val = data.getUint8(offset);
      offset += 1;
      return val;
    }
  
    function readInt32() {
      if (offset + 4 > data.byteLength)
        throw new Error(`Unexpected end of file at offset ${offset}`);
      const val = data.getInt32(offset, true);
      offset += 4;
      return val;
    }
  
    function readFloat32() {
      if (offset + 4 > data.byteLength)
        throw new Error(`Unexpected end of file at offset ${offset}`);
      const val = data.getFloat32(offset, true);
      offset += 4;
      return val;
    }
  
    function readCString(maxLen) {
      let str = "";
      for (let i = 0; i < maxLen; i++) {
        if (offset >= data.byteLength) break;
        const byte = data.getUint8(offset++);
        if (byte === 0) break;
        str += String.fromCharCode(byte);
      }
      return str.trim();
    }
  
    // --- STEP 1: Read header line
    let headerStr = "";
    while (offset < data.byteLength) {
      const byte = data.getUint8(offset++);
      if (byte === 0x0A || byte === 0x0D) break;
      headerStr += String.fromCharCode(byte);
    }
    const [verToken, formatToken] = headerStr.split(":");
    const version = parseInt(verToken, 10);
    if (formatToken !== "{SHAVITREPLAYFORMAT}{FINAL}") {
      throw new Error("Unrecognized replay format");
    }
  
    // --- STEP 2: Read header fields
    let mapName = "";
    let style = 0, track = 0, preFrames = 0;
    let frameCount = 0, fTime = 0;
    let steamID = 0, postFrames = 0, tickrate = 0;
    let zoneOffset = [0, 0];
  
    if (version >= 3) {
      mapName = readCString(256);
      style = readUint8();
      track = readUint8();
      preFrames = readInt32();
    }
    frameCount = readInt32();
    fTime = readFloat32();
  
    if (version < 7) {
      frameCount -= preFrames;
    }
    if (version >= 4) {
      steamID = readInt32();
    } else {
      steamID = parseInt(readCString(32), 10);
    }
    if (version >= 5) {
      postFrames = readInt32();
      tickrate = readFloat32();
    }
    if (version >= 8) {
      zoneOffset[0] = readInt32();
      zoneOffset[1] = readInt32();
    }
  
    // --- STEP 3: Read frames
    let frameSize = 24;
    if (version >= 2) frameSize = 32;
    if (version >= 6) frameSize = 40;
  
    const frames = [];
    for (let i = 0; i < frameCount; i++) {
      if (offset + frameSize > data.byteLength) {
        throw new Error(`Frame #${i} incomplete: ran out of data!`);
      }
      const pos = {
        x: readFloat32(),
        y: readFloat32(),
        z: readFloat32()
      };
      const ang = {
        pitch: readFloat32(),
        yaw: readFloat32()
      };
      const buttons = readInt32();
  
      if (version >= 2) {
        readInt32(); // flags
        readInt32(); // movetype
      }
      if (version >= 6) {
        readInt32(); // mousexy
        readInt32(); // vel
      }
  
      frames.push({ origin: pos, angles: ang, buttons });
    }
  
    return {
      version,
      mapName,
      style,
      track,
      preFrames,
      frameCount,
      fTime,
      steamID,
      postFrames,
      tickrate,
      zoneOffset,
      frames
    };
  }
  