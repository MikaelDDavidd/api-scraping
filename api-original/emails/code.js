const code = function codeEmail(code, token) {
  return `<div class="container" style="width: 100%;display: grid;justify-content: center;">
  <div class="center" style="font-family: arial;max-width: 300px;
    background-color: #232d36;
    margin:0px auto;
    padding: 10px;
    box-sizing: border-box;
    padding: 0px 10px;
    border-radius: 10px;">
    <center>
      <img src="https://aitken.app/figurinha_logo.png" width="100px" style="position: relative;margin-top: 10px;"/>
    </center>
    <p style="text-align: center;">
      <span class="title" style="font-weight: bold;
        font-size: 22px;
        color: #fff;">
        COMPRA REALIZADA NA REMOÇÃO DE ANÚNCIO DO APP FIGURINHAS ANIMADAS
      </span>
    </p>
    <p style="text-align: center;">
      <span class="text" style="color: #ccc;"> CÓDIGO DE REMOÇÃO </span>
    </p>
    <p style="text-align: center;"><span class="code" style="background-color: #3b4956;
      color: #fff;
      padding: 15px;
      font-size: 30px;
      display: inline-block;
      margin: 10px 0px;
      border-radius: 10px;
      font-weight: bolder;">${code}</span></p>
    <p style="text-align: center;">
      <span class="text" style="color: #ccc;">
        Você desinstalou app e reinstalou e quer usar a remoção de anuncios
        então redefina o codigo clicando no link abaixo
      </span>
    </p>
    <p style="text-align: center;"><a style="color: aqua;" href="http://aitken.app/figurinhas/ads/deactivate/${token}">REATIVAR CÓDIGO</a></p>
  </div>
</div>
`;
};
module.exports = code;
