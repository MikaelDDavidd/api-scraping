const express = require("express");
const router = express.Router();
const webpReduce = require("../webp_reduce.js");
var rootPath = require("../root.js");
var atob = require("atob");

router.get("/:id/:image", async (req, res, next) => {
  let image = req.params.image;
  let id = req.params.id;
  let imageReduced = await webpReduce(image, id);
  return res.sendFile(rootPath + imageReduced);
});

module.exports = router;
