const webp = require("./webp-converter/src/webpconverter.js");
webp.grant_permission();
const fs = require("fs");
const fetch = require("node-fetch");
const utils = require("./utils.js");
const config = require("./config.js");

const ROOT_PATH = require("./root.js");
const WEBP_TEMP = ROOT_PATH + "/webp_temp/";
const WEBP_RELATIVE_REPOSITORY = ROOT_PATH + "/webp_animated_repository/";
const WEBP_REPOSITORY = "/webp_animated_repository/";
const WEBP_FRAMES = ROOT_PATH + "/webp_frames/";

const reduceAnimatedWebp = async function reduceAnimatedWebp(img, id, host) {
  let image = id + "_" + img;

  if (fs.existsSync(WEBP_RELATIVE_REPOSITORY + image)) {
    return WEBP_REPOSITORY + image;
  } else {
    await utils.copyFile(ROOT_PATH + config.PACKS_DIR +id + "/"+ img, WEBP_TEMP + image);
    //await download(host + img, image);
  }

  let imageName = image.split(".")[0];
  let info = await webp.webpmux_info(WEBP_TEMP + image);
  let framesSelected = [];
  let index = 0;
  let frames = Math.floor(info.duration / 142);
  if (frames == 1) {
    frames = Math.floor(info.duration / 80);
    if (frames == 1) {
      frames = Math.floor(info.duration / 50);
    }
  }
  let duration = info.duration / frames;
  let skipFrames = Math.ceil(info.totalFrames / frames);

  console.log("total frames: " + info.totalFrames);
  console.log("duration: " + duration);
  console.log("frames: " + frames);

  for (var i = 0; i < info.totalFrames; i += skipFrames) {
    if (index <= frames) {
      let outputImagePath =
        WEBP_FRAMES + imageName + "_frame_" + index + ".webp";
      framesSelected.push({
        path: outputImagePath,
        offset: "+100",
      });
      await webp.webpmux_getframe(
        WEBP_TEMP + image,
        outputImagePath,
        i.toString()
      );
      await webp.cwebp_resize(outputImagePath, 110, 65);

      index++;
    }
  }

  await webp.webpmux_animate(
    framesSelected,
    WEBP_RELATIVE_REPOSITORY + image,
    "10000",
    "255,255,255,255"
  );

  await webp.webpmux_set_duration(
    WEBP_RELATIVE_REPOSITORY + image,
    Math.floor(duration)
  );

  fs.unlink(WEBP_TEMP + image, (err) => {
    if (err) {
      console.error(err);
      return;
    }
  });

  for (let i in framesSelected) {
    fs.unlink(framesSelected[i].path, (err) => {
      if (err) {
        console.error(err);
        return;
      }
    });
  }

  return WEBP_REPOSITORY + image;
};

async function download(url, imageName) {
  console.log("baixando");
  const response = await fetch(url);
  const buffer = await response.buffer();
  await writeImage(WEBP_TEMP + imageName, buffer);
}

function writeImage(img, buffer) {
  return new Promise(function (resolve, reject) {
    fs.writeFile(img, buffer, { flag: "wx" }, function (err) {
      if (err) {
        console.log("dwonload erro");
        console.log(err);
        reject(err);
      } else {
        console.log("dwonload concluido");
        resolve(img);
      }
    });
  });
}

module.exports = reduceAnimatedWebp;
