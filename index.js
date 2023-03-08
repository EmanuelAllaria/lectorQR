const canvas = document.getElementById('canvas');
const resultado = document.querySelector('#resultado a').href;

navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}})
    .then(stream => {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.play();

        requestAnimationFrame(tick);

        function tick() {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'dontInvert'
                });

                if (code) {
                    resultado = code.data;
                }
            }

            requestAnimationFrame(tick);
        }
    })
    .catch(error => console.error(error));
