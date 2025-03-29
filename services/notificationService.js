// backend/services/notificationService.js
const Notification = require('../models/Notification');
const { getIO } = require('../socket');
const { DatabaseError } = require('../utils/errorTypes');
const logger = require('../utils/logger');

/**
 * Creates a new notification and emits it via Socket.io
 * @param {String} userId - ID of the user to notify
 * @param {String} message - Notification message
 * @param {String} type - Type of notification
 */
const sendNotification = async (userId, message, type) => {
  logger.info('Sending notification', { userId, message, type });
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

    return notification;
  } catch (error) {
    logger.error(`Error sending notification to user ${userId}`, { error: error.message, stack: error.stack });
    throw new DatabaseError(`Failed to create notification: ${error.message}`);
  }
};

/**
 * Marks a notification as read
 * @param {String} notificationId - ID of the notification
 * @param {String} userId - ID of the user who owns the notification
 * @returns {Promise<Object>} - The updated notification
 */
const markNotificationAsRead = async (notificationId, userId) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { read: true },
      { new: true }
    );

    if (!notification) {
      throw new Error('Notification not found or does not belong to user');
    }

    return notification;
  } catch (error) {
    logger.error(`Error marking notification ${notificationId} as read`, { error: error.message, stack: error.stack });
    throw new DatabaseError(`Failed to mark notification as read: ${error.message}`);
  }
};

/**
 * Marks all notifications for a user as read
 * @param {String} userId - ID of the user
 * @returns {Promise<Object>} - Result with count of updated notifications
 */
const markAllNotificationsAsRead = async (userId) => {
  try {
    const result = await Notification.updateMany(
      { userId, read: false },
      { read: true }
    );

    return { modifiedCount: result.nModified || 0 };
  } catch (error) {
    logger.error(`Error marking all notifications as read for user ${userId}`, { error: error.message, stack: error.stack });
    throw new DatabaseError(`Failed to mark all notifications as read: ${error.message}`);
  }
};

/**
 * Gets notifications for a user with pagination
 * @param {String} userId - ID of the user
 * @param {Object} options - Pagination and filter options
 * @returns {Promise<Object>} - Paginated notifications with metadata
 */
const getUserNotifications = async (userId, options = {}) => {
  const { page = 1, limit = 20, read } = options;

  try {
    const filter = { userId };

    if (read === true || read === false) {
      filter.read = read;
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10));

    const total = await Notification.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    return {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      totalPages,
      notifications,
    };
  } catch (error) {
    logger.error(`Error fetching notifications for user ${userId}`, { error: error.message, stack: error.stack });
    throw new DatabaseError(`Failed to fetch notifications: ${error.message}`);
  }
};

module.exports = { 
  sendNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUserNotifications
};
