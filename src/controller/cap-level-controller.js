/*
 * cap stream level to media size dimension controller
*/

import Event from '../events';
import EventHandler from '../event-handler';

class CapLevelController extends EventHandler {
  constructor (hls) {
    super(hls,
      Event.FPS_DROP_LEVEL_CAPPING,
      Event.MEDIA_ATTACHING,
      Event.MANIFEST_PARSED);
  }

  destroy () {
    if (this.hls.config.capLevelToPlayerSize) {
      this.media = this.restrictedLevels = null;
      this.autoLevelCapping = Number.POSITIVE_INFINITY;
      if (this.timer) {
        this.timer = clearInterval(this.timer);
      }
    }
  }

  onFpsDropLevelCapping (data) {
    // Don't add a restricted level more than once
    if (CapLevelController.isLevelAllowed(data.droppedLevel, this.restrictedLevels)) {
      this.restrictedLevels.push(data.droppedLevel);
    }
  }

  onMediaAttaching (data) {
    this.media = data.media instanceof HTMLVideoElement ? data.media : null;
  }

  onManifestParsed (data) {
    const hls = this.hls;
    this.restrictedLevels = [];
    // Only fire getMaxLevel or detectPlayerSize if video is expected in the manifest
    if (hls.config.capLevelToPlayerSize && (data.video || (data.levels.length && data.altAudio))) {
      this.autoLevelCapping = Number.POSITIVE_INFINITY;
      this.levels = data.levels;
      hls.firstLevel = this.getMaxLevel(data.firstLevel);
      clearInterval(this.timer);
      this.timer = setInterval(this.detectPlayerSize.bind(this), 1000);
      this.detectPlayerSize();
    }
  }

  detectPlayerSize () {
    if (this.media) {
      let levelsLength = this.levels ? this.levels.length : 0;
      if (levelsLength) {
        const hls = this.hls;
        hls.autoLevelCapping = this.getMaxLevel(levelsLength - 1);
        if (hls.autoLevelCapping > this.autoLevelCapping) {
          // if auto level capping has a higher value for the previous one, flush the buffer using nextLevelSwitch
          // usually happen when the user go to the fullscreen mode.
          hls.streamController.nextLevelSwitch();
        }
        this.autoLevelCapping = hls.autoLevelCapping;
      }
    }
  }

  /*
  * returns level should be the one with the dimensions equal or greater than the media (player) dimensions (so the video will be downscaled)
  */
  getMaxLevel (capLevelIndex) {
    if (!this.levels) {
      return -1;
    }

    const validLevels = this.levels.filter((level, index) =>
      CapLevelController.isLevelAllowed(index, this.restrictedLevels) && index <= capLevelIndex
    );

    return CapLevelController.getMaxLevelByMediaSize(validLevels, this.mediaWidth, this.mediaHeight);
  }

  get mediaWidth () {
    let width;
    const media = this.media;
    if (media) {
      width = media.width || media.clientWidth || media.offsetWidth;
      width *= CapLevelController.contentScaleFactor;
    }
    return width;
  }

  get mediaHeight () {
    let height;
    const media = this.media;
    if (media) {
      height = media.height || media.clientHeight || media.offsetHeight;
      height *= CapLevelController.contentScaleFactor;
    }
    return height;
  }

  static get contentScaleFactor () {
    let pixelRatio = 1;
    try {
      pixelRatio = window.devicePixelRatio;
    } catch (e) {}
    return pixelRatio;
  }

  static isLevelAllowed (level, restrictedLevels = []) {
    return restrictedLevels.indexOf(level) === -1;
  }

  static getMaxLevelByMediaSize (levels, width, height) {
    if (!levels || (levels && !levels.length)) {
      return -1;
    }

    // Levels can have the same dimensions but differing bandwidths - since levels are ordered, we can look to the next
    // to determine whether we've chosen the greatest bandwidth for the media's dimensions
    const atGreatestBandiwdth = (curLevel, nextLevel) => {
      if (!nextLevel) {
        return true;
      }

      return curLevel.width !== nextLevel.width || curLevel.height !== nextLevel.height;
    };

    // If we run through the loop without breaking, the media's dimensions are greater than every level, so default to
    // the max level
    let maxLevelIndex = levels.length - 1;

    for (let i = 0; i < levels.length; i += 1) {
      const level = levels[i];
      if ((level.width >= width || level.height >= height) && atGreatestBandiwdth(level, levels[i + 1])) {
        maxLevelIndex = i;
        break;
      }
    }

    return maxLevelIndex;
  }
}

export default CapLevelController;
