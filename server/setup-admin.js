const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const createAdminUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/usps-label-portal');
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('Admin user already exists:');
      console.log(`Email: ${existingAdmin.email}`);
      console.log(`Name: ${existingAdmin.fullName}`);
      console.log(`Role: ${existingAdmin.role}`);
      process.exit(0);
    }

    // Create admin user
    const adminUser = new User({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@uspslabelportal.com',
      password: 'admin123',
      role: 'admin'
    });

    await adminUser.save();

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@uspslabelportal.com');
    console.log('🔑 Password: admin123');
    console.log('👤 Role: Admin');
    console.log('\n⚠️  Please change the password after first login!');

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

createAdminUser();
