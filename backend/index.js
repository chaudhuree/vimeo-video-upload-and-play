const express = require('express');
const multer = require('multer');
const Vimeo = require('vimeo').Vimeo;
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const Video = require('./models/Video');

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors({
  origin: 'http://localhost:5173',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true
}));
app.use(express.json());

const VIMEO_CLIENT_ID = process.env.VIMEO_CLIENT_ID;
const VIMEO_CLIENT_SECRET = process.env.VIMEO_CLIENT_SECRET;
const VIMEO_ACCESS_TOKEN = process.env.VIMEO_ACCESS_TOKEN;

const vimeo = new Vimeo(VIMEO_CLIENT_ID, VIMEO_CLIENT_SECRET, VIMEO_ACCESS_TOKEN);

// Get all videos
app.get('/videos', async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    res.json(videos);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ error: 'Error fetching videos' });
  }
});

app.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }

  const videoPath = req.file.path;
  const videoTitle = req.body.title || 'Untitled Video';

  try {
    vimeo.upload(
      videoPath,
      async (uri) => {
        console.log('Video URI:', uri);
        const videoId = uri.split('/').pop();
        
        try {
          // Get the video details
          const videoDetails = await new Promise((resolve, reject) => {
            vimeo.request({
              method: 'GET',
              path: uri
            }, (error, body) => {
              if (error) reject(error);
              else resolve(body);
            });
          });

          // Update the video title
          await new Promise((resolve, reject) => {
            vimeo.request({
              method: 'PATCH',
              path: uri,
              query: {
                name: videoTitle,
              }
            }, (error, body) => {
              if (error) reject(error);
              else resolve(body);
            });
          });

          // Save video details to MongoDB
          const video = new Video({
            title: videoTitle,
            videoId: videoId,
            videoUrl: uri,
            embedUrl: videoDetails.embed.html,
            playerUrl: videoDetails.player_embed_url
          });

          await video.save();

          // Clean up the uploaded file
          try {
            fs.unlinkSync(videoPath);
          } catch (cleanupError) {
            console.error('Error cleaning up file:', cleanupError);
          }

          res.json(video);
        } catch (error) {
          console.error('Error processing video:', error);
          res.status(500).json({ error: 'Error processing video' });
        }
      },
      (bytes_uploaded, bytes_total) => {
        const percentage = ((bytes_uploaded / bytes_total) * 100).toFixed(2);
        console.log(`Uploaded ${percentage}%`);
      },
      (error) => {
        console.error('Error uploading to Vimeo:', error);
        try {
          fs.unlinkSync(videoPath);
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
        res.status(500).json({ error: 'Error uploading video' });
      }
    );
  } catch (error) {
    console.error('Error:', error);
    try {
      fs.unlinkSync(videoPath);
    } catch (cleanupError) {
      console.error('Error cleaning up file:', cleanupError);
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
