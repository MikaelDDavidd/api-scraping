const webp = require("./webp-converter/src/webpconverter");
const db = require("./mysql").db;
const connectionPromise = require("./mysql").createConnectionPromise();
const utils = require("./utils");
const date = require("date-and-time");
const fs = require("fs");
var AdmZip = require("adm-zip");
const axios = require("axios");
const fixPack = require("./fix_pack");
const config = require("./config");

process.env.TZ = "America/Recife";

const ROOT_PATH = require("./root.js");
const DATA_CAPTURED = ROOT_PATH + "/data_captured/";
const PACKS_REPOSITORY = ROOT_PATH + "/packs/";
const PACKS_UP = ROOT_PATH + "/packs_up/";
const ZIP_NAME = "pack.zip";
const TRAY_NAME = "tray.png";

let searchList = [{ keyword: "bruxelas", checked: true }];
let searchCount = 0;

let locales = config.LOCALES;

//searchService();

getStickersFromStickerly();

async function getStickersFromStickerly() {
  locales.forEach(async (item) => {
    const now = new Date();
    console.log(item.locale);
    let response = await axios({
      method: "get",
      url: "http://api.sticker.ly/v3.1/stickerPack/recommend?withAnimation=true",
      responseType: "json",
      headers: {
        "User-Agent": `androidapp.stickerly/1.17.3 (Redmi 7; U; Android 29; pt-BR; ${item.locale};)`,
        Connection: "Keep-Alive",
        Host: "api.sticker.ly",
        "x-duid": "20fa5a958492bbd3",
        "Accept-Encoding": "gzip",
      },
    });
    let packs = response.data.result.packs;
    if (packs.length > 0) {
      let jsonName = date.format(now, "YYYY_MM_DD_HH_mm_ss_") + "data.json";
      await utils.writeFile(
        DATA_CAPTURED + jsonName,
        JSON.stringify(response.data.result.packs)
      );
      getStickerPacks(jsonName, item.lang);
    }
    await sleep(4000);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchService() {
  console.log("começando varredura...");
  console.log(searchList.length);
  const now = new Date();
  for (let i in searchList) {
    if (!searchList[i].checked) {
      searchCount++;
      console.log("varredura: " + searchCount);
      let list = await searchForPacksFromStickerly(searchList[i].keyword);
      if (list.length > 0) {
        let jsonName = date.format(now, "YYYY_MM_DD_HH_mm_ss_") + "data.json";
        await utils.writeFile(DATA_CAPTURED + jsonName, JSON.stringify(list));
        searchList[i].checked = true;
        await getStickerPacks(jsonName);
      }
      break;
    }
  }
  setTimeout(async () => {
    await searchService();
  }, 10 * 1000);
}

async function searchForPacksFromStickerly(keyword) {
  let maxCursor = 460;
  let maxPacks = 62;
  let packs = [];
  let NextCursor = 0;
  let animatedCount = 0;
  do {
    let response = await axios({
      method: "POST",
      url: "http://api.sticker.ly:80/v3.1/stickerPack/search?withAnimation=true",
      responseType: "json",
      data: {
        keyword: keyword,
        cursor: NextCursor,
      },
      headers: {
        "User-Agent":
          "androidapp.stickerly/1.17.3 (Redmi 7; U; Android 29; pt-BR; br;)",
        Connection: "Keep-Alive",
        Host: "api.sticker.ly",
        "x-duid": "20fa5a958492bbd3",
        "Accept-Encoding": "gzip",
      },
    });
    if (response) {
      if (response.data.result.stickerPacks.length > 0) {
        if (NextCursor == 0) {
          packs = response.data.result.stickerPacks;
        } else {
          for (let i in response.data.result.stickerPacks) {
            if (response.data.result.stickerPacks[i].isAnimated) {
              packs.push(response.data.result.stickerPacks[i]);
              animatedCount++;
            }
          }
        }

        console.log("-------------- STATUS -------------");
        console.log("keyword: " + keyword);
        console.log("total stickers: " + packs.length);
        console.log("cursor: " + NextCursor);
        console.log("animated stickes: " + animatedCount);

        NextCursor++;
      } else {
        NextCursor = -1;
      }
    } else {
      NextCursor = -1;
    }
    if (maxCursor == NextCursor || packs.length >= maxPacks) {
      NextCursor = -1;
    }
  } while (parseInt(NextCursor) >= 0);
  console.log("varredura completa");
  return packs;
}

async function getStickerPacks(data, lang) {
  let added = 0;
  let list = await getJsonData(DATA_CAPTURED + data);
  list = JSON.parse(list);
  let packs = list;
  //packs = packs.filter((item) => item.isAnimated); packs.length
  for (var i = 0; i < packs.length; i++) {
    console.log("loop");
    let trayImage = "";
    let packId = packs[i].packId;
    let pack = packs[i];
    const [packsBD] = await connectionPromise.query(
      db.select("packs", ["identifier"], { identifier: packId })
    );
    if (packsBD.length == 0) {
      let packDir = PACKS_REPOSITORY + packId;
      let urlPrefix = packs[i].resourceUrlPrefix;
      let stickers = packs[i].resourceFiles;
      let zipUrl = urlPrefix + packs[i].resourceZip;
      let createFolder = await utils.createFolder(packDir);
      let stickersWithStatus = [];
      if (createFolder) {
        for (let item in stickers) {
          let stickerName = stickers[item];
          if (stickers[item].substr(-4) == ".png") {
            stickerName =
              stickerName.substr(0, stickerName.indexOf(".png")) + ".webp";
          }
          if (parseInt(item) == 0) {
            trayImage = stickers[item];
          }
          console.log(stickers[item]);
          let status = true;
          let stickPath = packDir + "/" + stickers[item];
          let a = await utils.fileExist(stickPath);
          if (!a) {
            console.log("não existe");
            status = await utils.download(
              urlPrefix + stickers[item],
              packDir + "/" + stickers[item]
            );
            if (status) {
              let stickerInfo = await webp.webpmux_info(
                packDir + "/" + stickers[item]
              );
              if (!("totalFrames" in stickerInfo) && pack.isAnimated) {
                status = false;
              }
            }
          }
          stickersWithStatus.push({
            status: status,
            name: stickerName,
          });
        }

        let trayImagePath = packDir + "/" + TRAY_NAME;
        if (pack.isAnimated) {
          await utils.download(zipUrl, packDir + "/" + ZIP_NAME);
          await webp.webpmux_getframe(
            packDir + "/" + trayImage,
            trayImagePath,
            1
          );
          webp.dwebp(trayImagePath, trayImagePath, "-resize 96 96 -o");
        } else {
          let status = await utils.copyFile(
            packDir + "/" + trayImage,
            trayImagePath
          );
          if (stickers[item]) {
            if (stickers[item].substr(-4) == ".png") {
              await webp.cwebp(trayImagePath, trayImagePath, "-q 80");
            }
          }
          setTimeout(async () => {
            await webp.dwebp(trayImagePath, trayImagePath, "-resize 96 96 -o");
          }, 1000);

          console.log("copiado: " + status);
        }

        const now = new Date();
        let [packInset] = await connectionPromise.query(
          db.insert("packs", {
            identifier: packId,
            name: pack.name.replace("'", ""),
            publisher: pack.authorName.replace("'", ""),
            tray: TRAY_NAME,
            zip_size: 0,
            level: 0,
            is_animated: pack.isAnimated ? 1 : 0,
            downloads: 0,
            origin: "sticker.ly",
            date: date.format(now, "YYYY-MM-DD HH:mm:ss"),
            lang: lang,
          })
        );

        for (let item in stickersWithStatus) {
          if (stickersWithStatus[item].status) {
            console.log("inserindo imagem: " + stickersWithStatus[item].name);
            await connectionPromise.query(
              db.insert("stickers", {
                name: stickersWithStatus[item].name,
                pack_id: packInset.insertId,
              })
            );
          }
        }
        added++;
        console.log(added);
        await formatStatic(
          packId,
          packs[i].resourceFiles,
          pack.isAnimated ? false : true
        );
      }
    } else {
      console.log("pack adicionado");
    }
  }
  return true;
}

async function stickerIsAnimated(path) {
  let info = await webp.webpmux_info(path);
  return info.totalFrames ? true : false;
}

async function formatStatic(identifier, stickers, isStatic) {
  let stickersParsed = [];
  let zipPath = PACKS_REPOSITORY + identifier + "/" + ZIP_NAME;
  let packPath = PACKS_REPOSITORY + identifier + "/";
  if (await utils.fileExist(zipPath)) {
    console.log("zip static encontrado para exclusão: " + identifier);
    await utils.deleteFile(zipPath);
  }
  let zip = new AdmZip();
  for (let i in stickers) {
    if (stickers[i].substr(-4) == ".png") {
      let webpName =
        stickers[i].substr(0, stickers[i].indexOf(".png")) + ".webp";
      await webp.cwebp(packPath + stickers[i], packPath + webpName, "-q 80");
      zip.addLocalFile(packPath + webpName);
      stickersParsed.push(webpName);
      await utils.deleteFile(packPath + stickers[i]);
    } else {
      zip.addLocalFile(packPath + stickers[i]);
      stickersParsed.push(stickers[i]);
    }
  }
  await zip.writeZip(zipPath);
  await fixPack.reduceTray(packPath, TRAY_NAME);
  await fixPack.resizeAnimatedPack(packPath);
}

function getJsonData(path) {
  return new Promise(function (resolve, reject) {
    fs.readFile(path, "utf8", function (err, jsonString) {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        resolve(jsonString);
      }
    });
  });
}

async function getStickersPacksFromPacksUp(suffix = "") {
  let packsParsed = [];
  let packs = await utils.getFilesNameInDir(PACKS_UP);
  for (var i in packs) {
    let keepChecking = true;
    do {
      let identifier = utils.generateRandomString(7);
      const [packsBD] = await connectionPromise.query(
        db.select("packs", ["identifier"], { identifier: identifier })
      );
      if (packsBD.length == 0) {
        console.log("identifier of pack: " + packs[i] + " was defined");
        keepChecking = false;
        packsParsed.push({
          file: packs[i],
          identifier: identifier,
        });
      }
    } while (keepChecking);
  }
  for (let index in packsParsed) {
    const [packsBD] = await connectionPromise.query(
      db.select("packs", ["origin"], { origin: packsParsed[index].file })
    );
    if (packsBD.length == 0) {
      let packDir = PACKS_REPOSITORY + packsParsed[index].identifier;
      let createFolder = await utils.createFolder(packDir);
      if (createFolder) {
        let packZip = packDir + "/" + ZIP_NAME;
        await utils.copyFile(PACKS_UP + packsParsed[index].file, packZip);
        var zip = new AdmZip(packZip);
        await zip.extractAllTo(packDir, true);
        await sleep(1000);
        let isAnimated = false;
        let packAuthor = "@pereira_jocelino";
        let packName = suffix;
        let identifier = packsParsed[index].identifier;
        let stickers = [];
        let authorFileDir = packDir + "/author.txt";
        let titleFileDir = packDir + "/title.txt";
        let checkedIfIsAnimated = false;
        if (await utils.fileExist(authorFileDir)) {
          packAuthor = await utils.readFile(authorFileDir);
          packAuthor = packAuthor;
          await utils.deleteFile(authorFileDir);
        }
        if (await utils.fileExist(titleFileDir)) {
          console.log("tem");
          packName = (await utils.readFile(titleFileDir)) + " - " + suffix;
          packName = packName;
          await utils.deleteFile(titleFileDir);
        }
        let filesInPack = await utils.getFilesNameInDir(packDir);
        for (var i in filesInPack) {
          if (filesInPack[i].substr(-4) == "webp") {
            let stickerName = filesInPack[i];
            if (!checkedIfIsAnimated) {
              let info = await webp.webpmux_info(packDir + "/" + stickerName);
              isAnimated = info.totalFrames ? true : false;
              checkedIfIsAnimated = true;
            }
            stickers.push({ name: stickerName, isAnimated: isAnimated });
          }
        }
        if (stickers.length > 2) {
          const now = new Date();
          let [packInset] = await connectionPromise.query(
            db.insert("packs", {
              identifier: identifier,
              name: packName.replace(/'/g, ""),
              publisher: packAuthor,
              tray: TRAY_NAME,
              zip_size: 0,
              level: 0,
              is_animated: isAnimated ? 1 : 0,
              downloads: 0,
              origin: packsParsed[index].file,
              date: date.format(now, "YYYY-MM-DD HH:mm:ss"),
            })
          );
          for (let i in stickers) {
            console.log("inserindo imagem: " + stickers[i].name);
            await connectionPromise.query(
              db.insert("stickers", {
                name: stickers[i].name,
                pack_id: packInset.insertId,
              })
            );
          }
          console.log("name: " + packName);
          isAnimatedBinary = isAnimated ? 1 : 0;
          await fixPack.reduceTray(packDir + "/", TRAY_NAME);
          await fixPack.resizeAnimatedPack(packDir + "/");
          await fixPack.reduceAnimatedPack(packDir + "/");
          await fixPack.removerDifferentStickersType(
            identifier,
            packInset.insertId,
            isAnimatedBinary
          );
        }
      }
    } else {
      console.log("pack already added");
    }
  }
  console.log(packsParsed);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  addKeywordToSearch(keyword) {
    console.log("nova keyword adicionada");
    searchList.push({ keyword: keyword, checked: false });
  },
};
