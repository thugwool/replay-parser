/**
 * Shavit Replay Parser
 * - Respect tickrate if version >= 5
 * - Not subtracting pre/post frames if version >= 7
 * - zoneOffset usage if version >= 8 (2D offset)
 * - DO NOT zero out frames by the first frame
 */

export async function parseShavitReplay(file) {
  const arrayBuffer = await file.arrayBuffer();
  const data = new DataView(arrayBuffer);
  let offset = 0;

  function readUint8() {
    if (offset + 1 > data.byteLength) throw Error(`EOF@${offset}`);
    return data.getUint8(offset++);
  }
  function readInt32() {
    if (offset + 4 > data.byteLength) throw Error(`EOF@${offset}`);
    const val = data.getInt32(offset, true);
    offset += 4;
    return val;
  }
  function readFloat32() {
    if (offset + 4 > data.byteLength) throw Error(`EOF@${offset}`);
    const val = data.getFloat32(offset, true);
    offset += 4;
    return val;
  }
  function readCString(maxLen) {
    let str = "";
    for (let i = 0; i < maxLen; i++) {
      if (offset >= data.byteLength) break;
      const b = data.getUint8(offset++);
      if (b === 0) break;
      str += String.fromCharCode(b);
    }
    return str.trim();
  }

  // 1) Read header line
  let headerLine = "";
  while (offset < data.byteLength) {
    const b = data.getUint8(offset++);
    if (b === 0x0A || b === 0x0D) break;
    headerLine += String.fromCharCode(b);
  }
  const [verToken, formatToken] = headerLine.split(":");
  const version = parseInt(verToken, 10);
  if (formatToken !== "{SHAVITREPLAYFORMAT}{FINAL}") {
    throw Error("Unrecognized replay format!");
  }

  let mapName = "";
  let style = 0,
    track = 0,
    preFrames = 0;
  let frameCount = 0,
    fTime = 0;
  let steamID = 0,
    postFrames = 0,
    tickrate = 100; // fallback
  let zoneOffset = [0, 0]; // 2D offset

  // 2) Basic fields for ver >= 3
  if (version >= 3) {
    mapName = readCString(256);
    style = readUint8();
    track = readUint8();
    preFrames = readInt32(); // older usage if version <7
  }

  frameCount = readInt32();
  fTime = readFloat32();

  // version <7 => subtract preFrames
  if (version < 7) {
    frameCount -= preFrames;
  }

  if (version >= 4) {
    steamID = readInt32();
  } else {
    // older replay with string auth
    const sAuth = readCString(32);
    // parse if needed
    steamID = parseInt(sAuth.replace(/[^\d]/g, ""));
  }

  // if version >=5 => postFrames, tickrate
  if (version >= 5) {
    postFrames = readInt32();
    tickrate = readFloat32(); // actual replay tickrate

    // older version <7 => subtract postFrames
    if (version < 7) {
      frameCount -= postFrames;
    }
  }

  // if version >=8 => read zone offset
  if (version >= 8) {
    zoneOffset[0] = readFloat32();
    zoneOffset[1] = readFloat32();
  }

  // 3) Frame reading
  let frameSize = 24; // older
  if (version >= 2) frameSize = 32;
  if (version >= 6) frameSize = 40;

  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    if (offset + frameSize > data.byteLength) {
      throw Error(`Frame #${i} incomplete!`);
    }
    const px = readFloat32();
    const py = readFloat32();
    const pz = readFloat32();
    const pitch = readFloat32();
    const yaw = readFloat32();
    const buttons = readInt32();

    if (version >= 2) {
      readInt32(); // flags
      readInt32(); // movetype
    }
    if (version >= 6) {
      readInt32(); // mousexy
      readInt32(); // vel
    }

    frames.push({
      origin: { x: px, y: py, z: pz },
      angles: { pitch, yaw },
      buttons,
    });
  }

  // DO NOT zero out frames by first frame
  // We'll rely on zoneOffset if needed

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
    frames,
  };
}
