const sharp = require("sharp");
const utils = require("./utils.js");
var AdmZip = require("adm-zip");
const webp = require("./webp-converter/src/webpconverter.js");
const rimraf = require("rimraf");
const fsPromise = require("fs").promises;
const db = require("./mysql.js").db;
const connectionPromise = require("./mysql.js").createConnectionPromise();
const fs = require("fs");


const ROOT_PATH = require("./root.js");
const { fileExist } = require("./utils.js");
const PACKS_REPOSITORY = ROOT_PATH + "/packs/";

const fixPack = {
  async reduceTray(path, tray) {
    let trayPath = path + tray;
    if ((await utils.fileExist(path + tray)) == false) {
      let allImages = await utils.getFilesNameInDir(path);
      let firstPngIndex = allImages.findIndex((e) => e.substr(-4) == ".png");
      console.log(firstPngIndex);
      trayPath = path + allImages[firstPngIndex];
      console.log(trayPath);
    }
    let finalTrayName = path + "final_" + tray;
    await sharp(trayPath).resize(96, 96).toFile(finalTrayName);

    await sharp(finalTrayName)
      .resize(96, 96)
      .toFile(path + "tray.png");
    await utils.deleteFile(finalTrayName);
  },
  async checkAllPacksTray() {
    let allPacks = await utils.getFilesNameInDir(PACKS_REPOSITORY);
    for (var i in allPacks) {
      let path = PACKS_REPOSITORY + allPacks[i] + "/";
      console.log(path);
      await this.reduceTray(path, "tray.png");
    }
  },
  async resizeAnimatedPack(path) {
    let repairFolderName = path + "repair_zip";
    let zipFile = path + "pack.zip";
    let res = await utils.createFolder(repairFolderName);
    if (res && (await utils.fileExist(zipFile))) {
      console.log("pack encontrado");
      let zip = new AdmZip(zipFile);
      await zip.extractAllTo(repairFolderName, true);
      let allStickers = await utils.getFilesNameInDir(repairFolderName);
      let foundSmallSticker = false;
      for (var i in allStickers) {
        if (allStickers[i].substr(-5) == ".webp") {
          console.log(allStickers[i]);
          let stickerFile = repairFolderName + "/" + allStickers[i];
          let stickerInfo = await webp.webpmux_info(stickerFile);
          let stickersSplittedFolder = repairFolderName + "/stickers_split";
          console.log(stickerInfo);
          if (stickerInfo.totalFrames && stickerInfo.duration) {
            if (stickerInfo.size.w != 512 && stickerInfo.size.h != 512) {
              foundSmallSticker = true;
              console.log("sticker pequeno");
              let durationFrame = Math.floor(
                stickerInfo.duration / stickerInfo.totalFrames
              );
              res = await utils.createFolder(stickersSplittedFolder);
              let framesToAnimate = [];
              if (res) {
                for (let e = 0; e < stickerInfo.totalFrames; e++) {
                  let stickerFrame =
                    stickersSplittedFolder + "/" + (e + 1) + "_frame.webp";
                  let quality = 52;
                  if (stickerInfo.totalFrames > 1000) {
                    quality = 40;
                  }
                  if (stickerInfo.totalFrames > 6500) {
                    quality = 30;
                  }
                  await webp.webpmux_getframe(stickerFile, stickerFrame, e + 1);
                  await webp.cwebp_resize(stickerFrame, 512, quality);
                  framesToAnimate.push({
                    path: stickerFrame,
                    offset: "+100",
                  });
                }
                await webp.webpmux_animate(
                  framesToAnimate,
                  stickerFile,
                  "10",
                  "255,255,255,255"
                );
                await webp.webpmux_set_duration(
                  stickerFile,
                  Math.floor(durationFrame)
                );
                for (let i in framesToAnimate) {
                  await utils.deleteFile(framesToAnimate[i].path);
                }
              }
            }
          }
        }
      }
      if (foundSmallSticker) {
        console.log("preparando para zipar");
        let packZip = new AdmZip();
        for (var i in allStickers) {
          let stickerFile = repairFolderName + "/" + allStickers[i];
          let fileType = stickerFile.substr(-4);
          if (fileType == ".png" || fileType == ".txt" || fileType == "webp") {
            packZip.addLocalFile(stickerFile);
          }
        }
        console.log(zipFile);
        await utils.deleteFile(zipFile);
        await packZip.writeZip(zipFile);
      }
      await rimraf.sync(repairFolderName);
    }
  },
  async reduceAnimatedPack(path) {
    let repairFolderName = path + "repair_zip";
    let zipFile = path + "pack.zip";
    let res = await utils.createFolder(repairFolderName);
    if (res && (await utils.fileExist(zipFile))) {
      console.log("pack encontrado");
      let zip = new AdmZip(zipFile);
      await zip.extractAllTo(repairFolderName, true);
      let allStickers = await utils.getFilesNameInDir(repairFolderName);
      let foundSmallSticker = false;
      for (var i in allStickers) {
        if (allStickers[i].substr(-5) == ".webp") {
          //console.log(allStickers[i]);
          let stickerFile = repairFolderName + "/" + allStickers[i];
          let stickerInfo = await webp.webpmux_info(stickerFile);
          let stickerSize = await fsPromise.stat(stickerFile);
          let stickersSplittedFolder = repairFolderName + "/stickers_split";
          //console.log(stickerInfo);
          if (
            stickerInfo.totalFrames &&
            stickerInfo.duration &&
            stickerSize.size >= 500000
          ) {
            foundSmallSticker = true;
            console.log("sticker pesado");
            let durationFrame = Math.floor(
              stickerInfo.duration / stickerInfo.totalFrames
            );
            res = await utils.createFolder(stickersSplittedFolder);
            let framesToAnimate = [];
            let skipFrame = true;
            if (res) {
              let skipNextFrame = false;
              let framesAdded = 0;
              for (let e = 0; e < stickerInfo.totalFrames; e++) {
                let stickerFrame =
                  stickersSplittedFolder + "/" + (e + 1) + "_frame.webp";
                let quality = 80;

                if (!skipNextFrame) {
                  framesAdded++;
                  await webp.webpmux_getframe(stickerFile, stickerFrame, e + 1);
                  await webp.cwebp_resize(stickerFrame, 512, quality);
                  framesToAnimate.push({
                    path: stickerFrame,
                    offset: "+100",
                  });
                }
                if (skipFrame) {
                  skipNextFrame = skipNextFrame ? false : true;
                }
              }
              console.log("frames: " + framesAdded);
              await webp.webpmux_animate(
                framesToAnimate,
                stickerFile,
                "10",
                "255,255,255,255"
              );
              if (skipFrame) {
                durationFrame = durationFrame * 2;
              }
              await webp.webpmux_set_duration(
                stickerFile,
                Math.floor(durationFrame)
              );
              for (let i in framesToAnimate) {
                await utils.deleteFile(framesToAnimate[i].path);
              }
            }
          } else {
            console.log("sticker animado regular");
          }
        }
      }
      if (foundSmallSticker) {
        console.log("preparando para zipar");
        let packZip = new AdmZip();
        for (var i in allStickers) {
          let stickerFile = repairFolderName + "/" + allStickers[i];
          let fileType = stickerFile.substr(-4);
          if (fileType == ".png" || fileType == ".txt" || fileType == "webp") {
            packZip.addLocalFile(stickerFile);
          }
        }
        console.log(zipFile);
        await utils.deleteFile(zipFile);
        await packZip.writeZip(zipFile);
      }
      await rimraf.sync(repairFolderName);
    }
  },
  async stickerIsAnimated(path) {
    let info = await webp.webpmux_info(path);
    return info.totalFrames ? true : false;
  },
  async checkAllPacksZip() {
    let allPacks = await utils.getFilesNameInDir(PACKS_REPOSITORY);
    for (var i in allPacks) {
      let path = PACKS_REPOSITORY + allPacks[i] + "/";
      console.log(path);
      await this.reduceAnimatedPack(path);
    }
  },
  async removerDifferentStickersType(identifier, packId, type) {
    console.log("verificando tipagem...");
    let removed = false;
    let [stickers] = await connectionPromise.query(
      db.select("stickers", "*", { pack_id: packId })
    );
    if (stickers.length > 0) {
      let removedStickers = 0;
      for (let i in stickers) {
        let path = PACKS_REPOSITORY + identifier + "/" + stickers[i].name;
        if (await utils.fileExist(path)) {
          let stickerType = await this.stickerIsAnimated(path);
          if (stickerType != type) {
            console.log("sticker " + stickers[i].name + " removido");
            removedStickers++;
            removed = true;
            await connectionPromise.query(
              `DELETE FROM stickers WHERE pack_id = '${packId}' AND name = '${stickers[i].name}'`
            );
            await utils.deleteFile(path);
          }
        } else {
          removedStickers++;
          removed = true;
          await connectionPromise.query(
            `DELETE FROM stickers WHERE pack_id = '${packId}' AND name = '${stickers[i].name}'`
          );
        }
      }
      console.log("total figurinhas removida: " + removedStickers);
      if (stickers.length - removedStickers < 3) {
        console.log("pack com poucas figurinhas: " + identifier);
        await connectionPromise.query(
          `DELETE FROM packs WHERE id = '${packId}'`
        );
      }
    }
    return removed;
  },
  async checkAllStickersType() {
    let [allPacks] = await connectionPromise.query(
      db.select("packs", ["identifier", "id", "is_animated"])
    );
    let index = 0;
    let removed = 0;
    if (allPacks.length > 0) {
      for (var i in allPacks) {
        console.log(
          "analise dos packs: " + index + "/" + allPacks.length + "/" + removed
        );
        let res = await this.removerDifferentStickersType(
          allPacks[i].identifier,
          allPacks[i].id,
          allPacks[i].is_animated
        );
        if (res) {
          removed++;
        }
        index++;
      }
    }
  },
  async checkIfPackNoExist() {
    let data = { total: 0, identifier: [] };
    let packs = await utils.getFilesNameInDir(PACKS_REPOSITORY);
    for (var i in packs) {
      let packName = packs[i];
      let path = PACKS_REPOSITORY + packName + "/";
      let [packsDB] = await connectionPromise.query(
        db.select("packs", ["id", "identifier"], { identifier: packName })
      );
      if (packsDB.length == 0) {
        data.total++;
        data.identifier.push(packName);
        console.log("pack file found: " + data.total + " - " + packName);
      }
      console.log(packsDB);
    }
    await fsPromise.writeFile(
      ROOT_PATH + "/" + "packs_to_delete.json",
      JSON.stringify(data)
    );
    return;
  },
async deletePacksFound() {
    try {
      const data = fs.readFileSync(
        ROOT_PATH + "/" + "packs_to_delete.json",
        "utf8"
      );
      console.log(data);
      let dataParsed = JSON.parse(data);
      dataParsed.identifier.forEach((e, i) => {
        let path = PACKS_REPOSITORY + e + "/";
        fs.rmdirSync(path, { recursive: true });
        console.log(e + " deletado");
      });
    } catch (err) {
      console.error(err);
    }
  },
};

module.exports = fixPack;
