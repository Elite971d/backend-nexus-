// scripts/migrateTenants.js
// Migration script to assign default tenant to existing records without tenantId
// Safe to run multiple times - idempotent

const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('../config/db');
const Tenant = require('../models/Tenant');
const User = require('../models/user');
const Lead = require('../models/Lead');
const Buyer = require('../models/Buyer');
const Template = require('../models/Template');
const Message = require('../models/Message');
const MessageThread = require('../models/MessageThread');
const Notification = require('../models/Notification');

const modelsToMigrate = [
  { model: Lead, name: 'Lead' },
  { model: Buyer, name: 'Buyer' },
  { model: Template, name: 'Template' },
  { model: Message, name: 'Message' },
  { model: MessageThread, name: 'MessageThread' },
  { model: Notification, name: 'Notification' }
];

async function migrateTenants() {
  try {
    await connectDB();
    console.log('✅ Database connected');

    // Find or create default tenant
    let defaultTenant = await Tenant.findOne({ slug: 'elite-nexus' });
    if (!defaultTenant) {
      defaultTenant = await Tenant.create({
        name: 'Elite Nexus',
        slug: 'elite-nexus',
        brandName: 'Elite Nexus',
        primaryColor: '#0b1d51',
        secondaryColor: '#ff6f00'
      });
      console.log('✅ Created default tenant: Elite Nexus');
    } else {
      console.log('✅ Found default tenant: Elite Nexus');
    }

    // Ensure all users have tenantId
    const usersWithoutTenant = await User.countDocuments({ tenantId: { $exists: false } });
    if (usersWithoutTenant > 0) {
      const result = await User.updateMany(
        { tenantId: { $exists: false } },
        { $set: { tenantId: defaultTenant._id } }
      );
      console.log(`✅ Assigned ${result.modifiedCount} users to default tenant`);
    } else {
      console.log('✅ All users already have tenantId');
    }

    // Migrate each model
    for (const { model, name } of modelsToMigrate) {
      const count = await model.countDocuments({ tenantId: { $exists: false } });
      if (count > 0) {
        const result = await model.updateMany(
          { tenantId: { $exists: false } },
          { $set: { tenantId: defaultTenant._id } }
        );
        console.log(`✅ Assigned ${result.modifiedCount} ${name} records to default tenant`);
      } else {
        console.log(`✅ All ${name} records already have tenantId`);
      }
    }

    // Handle models that reference other entities (get tenantId from relationships)
    // Messages - get tenantId from thread relationship
    const messagesWithoutTenant = await Message.countDocuments({ tenantId: { $exists: false } });
    if (messagesWithoutTenant > 0) {
      const messages = await Message.find({ tenantId: { $exists: false } }).populate('threadId');
      let updated = 0;
      for (const msg of messages) {
        if (msg.threadId && msg.threadId.tenantId) {
          msg.tenantId = msg.threadId.tenantId;
          await msg.save();
          updated++;
        } else if (!msg.tenantId) {
          msg.tenantId = defaultTenant._id;
          await msg.save();
          updated++;
        }
      }
      if (updated > 0) {
        console.log(`✅ Assigned ${updated} Message records via thread relationship`);
      }
    }

    // MessageThreads - get tenantId from participants
    const threadsWithoutTenant = await MessageThread.countDocuments({ tenantId: { $exists: false } });
    if (threadsWithoutTenant > 0) {
      const threads = await MessageThread.find({ tenantId: { $exists: false } });
      let updated = 0;
      for (const thread of threads) {
        if (thread.participants && thread.participants.length > 0) {
          const firstUser = await User.findById(thread.participants[0]);
          if (firstUser && firstUser.tenantId) {
            thread.tenantId = firstUser.tenantId;
            await thread.save();
            updated++;
          } else if (!thread.tenantId) {
            thread.tenantId = defaultTenant._id;
            await thread.save();
            updated++;
          }
        } else if (!thread.tenantId) {
          thread.tenantId = defaultTenant._id;
          await thread.save();
          updated++;
        }
      }
      if (updated > 0) {
        console.log(`✅ Assigned ${updated} MessageThread records via participant relationship`);
      }
    }

    // Notifications - get tenantId from userId
    const notificationsWithoutTenant = await Notification.countDocuments({ tenantId: { $exists: false } });
    if (notificationsWithoutTenant > 0) {
      const notifications = await Notification.find({ tenantId: { $exists: false } });
      let updated = 0;
      for (const notif of notifications) {
        if (notif.userId) {
          const user = await User.findById(notif.userId);
          if (user && user.tenantId) {
            notif.tenantId = user.tenantId;
            await notif.save();
            updated++;
          } else if (!notif.tenantId) {
            notif.tenantId = defaultTenant._id;
            await notif.save();
            updated++;
          }
        } else if (!notif.tenantId) {
          notif.tenantId = defaultTenant._id;
          await notif.save();
          updated++;
        }
      }
      if (updated > 0) {
        console.log(`✅ Assigned ${updated} Notification records via user relationship`);
      }
    }

    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  migrateTenants();
}

module.exports = migrateTenants;
