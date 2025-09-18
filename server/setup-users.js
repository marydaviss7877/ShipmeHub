const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const createTestUsers = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/usps-label-portal');
    console.log('Connected to MongoDB');

    // Test users data
    const testUsers = [
      {
        firstName: 'John',
        lastName: 'Reseller',
        email: 'reseller@example.com',
        password: 'reseller123',
        role: 'reseller'
      },
      {
        firstName: 'Jane',
        lastName: 'User',
        email: 'user@example.com',
        password: 'user123',
        role: 'user'
      },
      {
        firstName: 'Bob',
        lastName: 'Client',
        email: 'client@example.com',
        password: 'client123',
        role: 'user'
      }
    ];

    console.log('Creating test users...\n');

    const createdUsers = {};

    for (const userData of testUsers) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        console.log(`⚠️  User ${userData.email} already exists`);
        createdUsers[userData.email] = existingUser;
        continue;
      }

      // Create user
      const user = new User(userData);
      await user.save();
      createdUsers[userData.email] = user;
      console.log(`✅ Created ${userData.role}: ${userData.email} (${userData.password})`);
    }

    // Set up reseller-client relationships
    console.log('\n🔗 Setting up reseller-client relationships...');
    
    const reseller = createdUsers['reseller@example.com'];
    const user1 = createdUsers['user@example.com'];
    const user2 = createdUsers['client@example.com'];

    if (reseller && user1 && user2) {
      // Add clients to reseller
      reseller.clients = [user1._id, user2._id];
      await reseller.save();
      console.log(`✅ Added ${user1.email} and ${user2.email} as clients of ${reseller.email}`);
    }

    console.log('\n🎉 Test users created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('👑 Admin: admin@uspslabelportal.com / admin123');
    console.log('🏢 Reseller: reseller@example.com / reseller123');
    console.log('👤 User: user@example.com / user123');
    console.log('👤 Client: client@example.com / client123');

  } catch (error) {
    console.error('❌ Error creating test users:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

createTestUsers();
