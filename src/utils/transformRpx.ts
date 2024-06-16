const BASE_DEVICE_WIDTH = 750;

let isIPhone = false;
let deviceWidth: number;
let deviceDPR: number;

const checkDeviceWidth = () => {
  const info = wx.getSystemInfoSync();

  const newDeviceWidth = info.screenWidth || 375;
  const newDeviceDPR = info.pixelRatio || 2;

  isIPhone = info.platform === "ios";

  if (!isIPhone) {
    // HACK switch width and height when landscape
    // const newDeviceHeight = info.screenHeight || 375
    // 暂时不处理转屏的情况
  }

  if (newDeviceWidth !== deviceWidth || newDeviceDPR !== deviceDPR) {
    deviceWidth = newDeviceWidth;
    deviceDPR = newDeviceDPR;
  }
};

checkDeviceWidth();

const eps = 1e-4;

const transformByDPR = (number) => {
  if (number === 0) {
    return 0;
  }
  number = (number / BASE_DEVICE_WIDTH) * deviceWidth;
  number = Math.floor(number + eps);
  if (number === 0) {
    if (deviceDPR === 1 || !isIPhone) {
      return 1;
    }
    return 0.5;
  }
  return number;
};

const rpxRE = /([+-]?\d+(?:\.\d+)?)rpx/gi;

export const transformRpx = (style, inline = false) => {
  if (typeof style !== "string") {
    return style;
  }

  return style.replace(
    rpxRE,
    (_, num) => transformByDPR(Number(num)) + (inline ? "px" : ""),
  );
};
