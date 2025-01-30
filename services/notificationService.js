
// backend/services/notificationService.js

const Notification = require('../models/Notification');
const { getIO } = require('../socket');

/**
 * Creates a new notification and emits it via Socket.io
 * @param {String} userId - ID of the user to notify
 * @param {String} message - Notification message
 * @param {String} type - Type of notification
 */
const sendNotification = async (userId, message, type) => {
  console.log("sending notification");
  try {
    // Create a new notification in the database
    const notification = await Notification.create({
      userId,
      message,
      type,
    });

    // Emit the notification via Socket.io to the specific user room
    const io = getIO();
    io.to(userId.toString()).emit('notification', {
      _id: notification._id,
      message: notification.message,
      read: notification.read,
      type: notification.type,
      createdAt: notification.createdAt,
    });
  } catch (error) {
    console.error(`Error sending notification to user ${userId}:`, error.message);
  }
};

module.exports = { sendNotification };

