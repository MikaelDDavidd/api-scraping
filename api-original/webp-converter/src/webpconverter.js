const exec = require("child_process").execFile; //get child_process module
const fs = require("fs");
const enwebp = require("./cwebp.js"); //get cwebp module(converts other image format to webp)
const dewebp = require("./dwebp.js"); //get dwebp module(converts webp format to other image)
const gifwebp = require("./gwebp.js"); //get gif2webp module(convert git image to webp)
const webpmux = require("./webpmux.js"); //get webpmux module(convert non animated webp images to animated webp)
const buffer_utils = require("./buffer_utils.js"); //get buffer utilities

//permission issue in Linux and macOS
module.exports.grant_permission = () => {
  const arr = [enwebp(), dewebp(), gifwebp(), webpmux()];

  arr.forEach((exe_path) => {
    fs.chmodSync(exe_path, 0o755);
  });
};

//convert base64 to webp base64
module.exports.str2webpstr = (base64str, image_type, option, extra_path) => {
  // base64str of image
  // base64str image type jpg,png ...
  //option: options and quality,it should be given between 0 to 100
  return buffer_utils
    .base64str2webp(base64str, image_type, option, extra_path)
    .then(function (val) {
      return val;
    });
};

//convert buffer to webp buffer
module.exports.buffer2webpbuffer = (buffer, image_type, option, extra_path) => {
  // buffer of image
  // buffer image type jpg,png ...
  //option: options and quality,it should be given between 0 to 100
  return buffer_utils
    .buffer2webp(buffer, image_type, option, extra_path)
    .then(function (val) {
      return val;
    });
};

//now convert image to .webp format
module.exports.cwebp = (
  input_image,
  output_image,
  option,
  logging = "-quiet"
) => {
  // input_image: input image(.jpeg, .pnp ....)
  //output_image: output image .webp
  //option: options and quality,it should be given between 0 to 100

  const query = `${option} "${input_image}" -o "${output_image}"`; //command to convert image

  //enwebp() return which platform webp library should be used for conversion
  return new Promise((resolve, reject) => {
    //execute command
    exec(
      `"${enwebp()}"`,
      query.split(/\s+/),
      { shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
        }
        resolve(stdout ? stdout : stderr);
      }
    );
  });
};

/******************************************************* dwebp *****************************************************/

//now convert .webp to other image format
module.exports.dwebp = (
  input_image,
  output_image,
  option,
  logging = "-quiet"
) => {
  // input_image: input image .webp
  //output_image: output image(.jpeg, .pnp ....)
  //option: options and quality,it should be given between 0 to 100

  const query = `"${input_image}" ${option} "${output_image}" `; //command to convert image

  //dewebp() return which platform webp library should be used for conversion
  return new Promise((resolve, reject) => {
    //execute command
    exec(
      `"${dewebp()}"`,
      query.split(/\s+/),
      { shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
        }
        resolve(stdout ? stdout : stderr);
      }
    );
  });
};

/******************************************************* gif2webp *****************************************************/

//now convert .gif image to .webp format
module.exports.gwebp = (
  input_image,
  output_image,
  option,
  logging = "-quiet"
) => {
  // input_image: input image(.jpeg, .pnp ....)
  //output_image: /output image .webp
  //option: options and quality,it should be given between 0 to 100

  const query = `${option} "${input_image}" -o "${output_image}" `; //command to convert image

  //gifwebp() return which platform webp library should be used for conversion
  return new Promise((resolve, reject) => {
    //execute command
    exec(
      `"${gifwebp()}"`,
      query.split(/\s+/),
      { shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
        }
        resolve(stdout ? stdout : stderr);
      }
    );
  });
};

/******************************************************* webpmux *****************************************************/

//%%%%%%%%%%% Add ICC profile,XMP metadata and EXIF metadata

module.exports.webpmux_add = (
  input_image,
  output_image,
  icc_profile,
  option,
  logging = "-quiet"
) => {
  // input_image: input image(.webp)
  //output_image: output image .webp
  //icc_profile: icc profile
  //option: get or set option (icc,xmp,exif)

  const query = `-set ${option} ${icc_profile} "${input_image}" -o "${output_image}" `;

  //webpmux() return which platform webp library should be used for conversion
  return new Promise((resolve, reject) => {
    //execute command
    exec(
      `"${webpmux()}"`,
      query.split(/\s+/),
      { shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
        }
        resolve(stdout ? stdout : stderr);
      }
    );
  });
};

//%%%%%%%%%%%%% Extract ICC profile,XMP metadata and EXIF metadata

module.exports.webpmux_extract = (
  input_image,
  icc_profile,
  option,
  logging = "-quiet"
) => {
  // input_image: input image(.webp)
  //icc_profile: icc profile

  const query = `-get ${option} "${input_image}" -o ${icc_profile} `;

  //webpmux() return which platform webp library should be used for conversion
  return new Promise((resolve, reject) => {
    //execute command
    exec(
      `"${webpmux()}"`,
      query.split(/\s+/),
      { shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
        }
        resolve(stdout ? stdout : stderr);
      }
    );
  });
};

//%%%%%%%% Strip ICC profile,XMP metadata and EXIF metadata

module.exports.webpmux_strip = (
  input_image,
  output_image,
  option,
  logging = "-quiet"
) => {
  // input_image: input image(.webp)
  //output_image: output image .webp

  const query = `-strip ${option} "${input_image}" -o "${output_image}" `;

  //webpmux() return which platform webp library should be used for conversion
  return new Promise((resolve, reject) => {
    //execute command
    exec(
      `"${webpmux()}"`,
      query.split(/\s+/),
      { shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
        }
        resolve(stdout ? stdout : stderr);
      }
    );
  });
};

//%%%%%%%%%%% Create an animated WebP file from Webp images

module.exports.webpmux_animate = (
  input_images,
  output_image,
  loop,
  bgcolor,
  duration,
  logging = "-quiet"
) => {
  // input_images: array of image(.webp)
  //output_image: animatedimage .webp
  //loop:Loop the frames n number of times
  //bgcolor: Background color of the canvas

  let files = `-frame ${input_images[0]["path"]} ${input_images[0]["offset"]}`;

  let j = input_images.length;

  for (i = 1; i < j; i++) {
    files = `${files} -frame "${input_images[i]["path"]}" ${input_images[i]["offset"]}`;
  }

  const query = `${files} -loop ${loop} -bgcolor ${bgcolor} -o "${output_image}" `;

  //webpmux() return which platform webp library should be used for conversion
  return new Promise((resolve, reject) => {
    //execute command
    exec(
      `"${webpmux()}"`,
      query.split(/\s+/),
      { shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
        }
        resolve(stdout ? stdout : stderr);
      }
    );
  });
};

//%%%%%%%%%%%% Get the a frame from an animated WebP file

module.exports.webpmux_getframe = (
  input_image,
  output_image,
  frame_number,
  logging = "-quiet"
) => {
  // input_image: input image(.webp)
  //output_image: output image .webp
  //frame_number: frame number

  const query = `-get frame ${frame_number} "${input_image}" -o "${output_image}" `;

  //webpmux() return which platform webp library should be used for conversion
  return new Promise((resolve, reject) => {
    //execute command
    exec(
      `"${webpmux()}"`,
      query.split(/\s+/),
      { shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
        }
        resolve(stdout ? stdout : stderr);
      }
    );
  });
};

module.exports.webpmux_info = (input_image) => {
  const query = `-info "${input_image}"`;

  return new Promise((resolve, reject) => {
    exec(
      `"${webpmux()}"`,
      query.split(/\s+/),
      { shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
        }
        //console.log(stdout);
        let info = {};
        let lines = stdout.split("\n");
        if (lines.length > 0) {
          let framesLength = lines.find(
            (line) => line.indexOf("Number of frames") == 0
          );
          if (framesLength) {
            info.totalFrames = parseInt(framesLength.split(": ")[1]);
          }
          let imageSize = lines.find(
            (line) => line.indexOf("Canvas size") == 0
          );
          if (imageSize) {
            info.size = {};
            info.size["w"] = parseInt(imageSize.split(": ")[1].split(" x ")[0]);
            info.size["h"] = parseInt(imageSize.split(": ")[1].split(" x ")[1]);
          }
          let frameLines = lines.find((line) => line.indexOf("No.:") == 0);
          let duration = 0;
          if (frameLines) {
            let index = lines.findIndex((line) => line.indexOf("No.:") == 0);
            for (let i = index + 1; i < lines.length; i++) {
              let columnsDirt = lines[i].split(" ");
              let columns = [];
              for (var item in columnsDirt) {
                if (!columnsDirt[item] == "") {
                  columns.push(columnsDirt[item]);
                }
              }
              if (columns[6]) {
                duration += parseInt(columns[6]);
              }
            }
          }
          info.duration = duration;
        }
        resolve(info ? info : stderr);
      }
    );
  });
};

module.exports.cwebp_resize = (input_image, size, quality) => {
  const query = `-resize ${size} ${size} -q ${quality} "${input_image}" -o "${input_image}"`;
  return new Promise((resolve, reject) => {
    exec(
      `"${enwebp()}"`,
      query.split(/\s+/),
      { shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
        }
        resolve(stdout ? stdout : stderr);
      }
    );
  });
};

module.exports.resize_animated_webp = (input_image, size, quality) => {
  const query = `${input_image} -layers coalesce -resize ${size}x${size} -layers CompareAny ${input_image}`;
  return new Promise((resolve, reject) => {
    exec(
      `"magick"`,
      query.split(/\s+/),
      { shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
        }
        resolve(stdout ? stdout : stderr);
      }
    );
  });
};

module.exports.webpmux_set_duration = (input_image, duration) => {
  const query = `-duration ${duration} "${input_image}" -o "${input_image}"`;

  return new Promise((resolve, reject) => {
    exec(
      `"${webpmux()}"`,
      query.split(/\s+/),
      { shell: true },
      (error, stdout, stderr) => {
        if (error) {
          console.warn(error);
        }
        resolve(stdout ? stdout : stderr);
      }
    );
  });
};
