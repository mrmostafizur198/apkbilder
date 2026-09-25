const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ফাইল আপলোড কনফিগারেশন (App Icon / Splash Screen)
const upload = multer({ dest: 'uploads/' });

// SSE (Server-Sent Events) ক্লায়েন্ট লিস্ট
let clients = [];

// হোম পেজ রাউট
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// লাইভ প্রোগ্রেস স্ট্রিম করার জন্য SSE এন্ডপয়েন্ট
app.get('/api/build-progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    clients.push(newClient);

    req.on('close', () => {
        clients = clients.filter(client => client.id !== clientId);
    });
});

// APK বিল্ড রিকোয়েস্ট হ্যান্ডলার
app.post('/build-apk', upload.fields([
    { name: 'appIcon', maxCount: 1 },
    { name: 'splashScreen', maxCount: 1 },
    { name: 'zipFile', maxCount: 1 }
]), (req, res) => {
    res.json({ message: 'Build initiated successfully' });

    // লাইভ প্রোগ্রেস সিমুলেশন (এখানে আপনার আসল বিল্ড কমান্ড যুক্ত হবে)
    let percent = 0;
    const interval = setInterval(() => {
        percent += 20;

        let message = `Building APK... (${percent}%)`;
        if (percent === 20) message = 'Parsing app configuration...';
        else if (percent === 40) message = 'Compiling assets and resources...';
        else if (percent === 60) message = 'Generating APK package...';
        else if (percent === 80) message = 'Signing APK file...';
        else if (percent === 100) message = 'Build completed successfully!';

        // সংযোগ থাকা সকল ক্লায়েন্টকে ডেটা পাঠানো
        clients.forEach(client => {
            client.res.write(`data: ${JSON.stringify({
                percent: percent,
                message: message,
                status: percent === 100 ? 'completed' : 'building',
                downloadUrl: percent === 100 ? '#' : null
            })}\n\n`);
        });

        if (percent >= 100) {
            clearInterval(interval);
        }
    }, 2000);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
