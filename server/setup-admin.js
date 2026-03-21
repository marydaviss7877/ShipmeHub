const mongoose = require('mongoose');
const User = require('./models/User');
const Balance = require('./models/Balance');
const Rate = require('./models/Rate');
require('dotenv').config();

const createAdminUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('ℹ️  Admin user already exists:');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name:  ${existingAdmin.fullName}`);
      console.log(`   Role:  ${existingAdmin.role}`);
      process.exit(0);
    }

    // Create admin user (password hashed by mongoose pre-save hook)
    const adminUser = new User({
      firstName: 'Admin',
      lastName:  'User',
      email:     'admin@uspslabelportal.com',
      password:  'Admin@123!',
      role:      'admin'
    });
    await adminUser.save();

    // Create associated balance and rate
    await Balance.create({
      user: adminUser._id,
      currentBalance: 10000,
      transactions: [{
        type: 'topup',
        amount: 10000,
        description: 'Initial admin balance',
        performedBy: adminUser._id
      }]
    });
    await Rate.create({
      user: adminUser._id,
      labelRate: 0.50,
      setBy: adminUser._id,
      notes: 'Admin rate'
    });

    console.log('\n✅ Admin user created successfully!');
    console.log('   📧 Email:    admin@uspslabelportal.com');
    console.log('   🔑 Password: Admin@123!');
    console.log('   👤 Role:     Admin');
    console.log('\n⚠️  Change the password after first login!\n');

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

createAdminUser();
