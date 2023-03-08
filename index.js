const video = document.getElementById('camara');
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

navigator.mediaDevices.getUserMedia({ video: true })
  .then((stream) => {
    video.srcObject = stream;
    video.play();
    requestAnimationFrame(escanearCodigoQR);
  });

function escanearCodigoQR() {
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const codigoQR = jsQR(imageData.data, imageData.width, imageData.height);
    if (codigoQR) {
      console.log(codigoQR.data);
    }
  }
  requestAnimationFrame(escanearCodigoQR);
}