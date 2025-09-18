const mongoose = require('mongoose');
const multer = require('multer');
const Grid = require('gridfs-stream');

// Initialize GridFS
let gfs;
let gfsBucket;

mongoose.connection.once('open', () => {
  console.log('MongoDB connection established, initializing GridFS...');
  
  // Initialize GridFS stream
  gfs = Grid(mongoose.connection.db, mongoose.mongo);
  gfs.collection('uploads');
  
  // Initialize GridFS bucket
  gfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'uploads'
  });
  
  console.log('GridFS initialized successfully');
});

// Create storage engine using memory storage
const storage = multer.memoryStorage();

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types for label requests and generated labels
    const allowedTypes = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/zip',
      'application/x-zip-compressed'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, Excel, CSV, and ZIP files are allowed.'), false);
    }
  }
});

// Check if GridFS is ready
const isGridFSReady = () => {
  return gfsBucket !== null && gfsBucket !== undefined;
};

// Save file to GridFS
const saveFileToGridFS = async (file, metadata) => {
  return new Promise((resolve, reject) => {
    // Check if GridFS bucket is ready
    if (!isGridFSReady()) {
      console.error('GridFS bucket not ready:', { gfsBucket: !!gfsBucket, gfs: !!gfs });
      reject(new Error('GridFS bucket not initialized. Database connection may not be ready.'));
      return;
    }

    const filename = `${Date.now()}-${file.originalname}`;
    const writeStream = gfsBucket.openUploadStream(filename, {
      metadata: metadata
    });

    writeStream.on('error', (error) => {
      console.error('GridFS write stream error:', error);
      reject(error);
    });

    writeStream.on('finish', (file) => {
      console.log('File saved to GridFS:', file.filename);
      resolve(file);
    });

    writeStream.end(file.buffer);
  });
};

// Get file by ID
const getFileById = async (fileId) => {
  try {
    const file = await gfs.files.findOne({ _id: new mongoose.Types.ObjectId(fileId) });
    return file;
  } catch (error) {
    console.error('Error getting file by ID:', error);
    throw error;
  }
};

// Get file stream for download
const getFileStream = (fileId) => {
  try {
    const downloadStream = gfsBucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
    return downloadStream;
  } catch (error) {
    console.error('Error creating file stream:', error);
    throw error;
  }
};

// Delete file
const deleteFile = async (fileId) => {
  try {
    await gfsBucket.delete(new mongoose.Types.ObjectId(fileId));
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};

// Get all files for a user
const getUserFiles = async (userId, fileType = null) => {
  try {
    let query = { 'metadata.uploadedBy': new mongoose.Types.ObjectId(userId) };
    if (fileType) {
      query['metadata.fileType'] = fileType;
    }
    
    const files = await gfs.files.find(query).sort({ uploadDate: -1 });
    return files;
  } catch (error) {
    console.error('Error getting user files:', error);
    throw error;
  }
};

module.exports = {
  upload,
  saveFileToGridFS,
  getFileById,
  getFileStream,
  deleteFile,
  getUserFiles,
  isGridFSReady,
  gfs,
  gfsBucket
};
