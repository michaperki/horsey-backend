// backend/routes/notification.js

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { ValidationError, ResourceNotFoundError } = require('../utils/errorTypes');
const { 
  sendNotification, 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  getUserNotifications 
} = require('../services/notificationService');
const mongoose = require('mongoose');

// GET /notifications
// Fetch notifications for the authenticated user
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 20, read } = req.query;
  
  let readFilter;
  if (read === 'true') readFilter = true;
  if (read === 'false') readFilter = false;

  console.log(`Fetching notifications for User ID=${userId} with filters: page=${page}, limit=${limit}, read=${read}`);

  const result = await getUserNotifications(userId, {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    read: readFilter
  });

  console.log(`Fetched ${result.notifications.length} notifications for User ID=${userId}`);

  res.json(result);
}));

// PATCH /notifications/:id/read
// Mark a specific notification as read
router.patch('/:id/read', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const notificationId = req.params.id;

  console.log(`Marking notification ID=${notificationId} as read for User ID=${userId}`);

  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new ValidationError('Invalid notification ID');
  }

  const notification = await markNotificationAsRead(notificationId, userId);
  console.log(`Notification ID=${notificationId} marked as read for User ID=${userId}`);

  res.json({ message: 'Notification marked as read', notification });
}));

// POST /notifications/read-all
// Mark all notifications as read for the authenticated user
router.post('/read-all', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  console.log(`Marking all notifications as read for User ID=${userId}`);

  const result = await markAllNotificationsAsRead(userId);
  console.log(`Marked ${result.modifiedCount} notifications as read for User ID=${userId}`);
  
  res.json({ message: 'All notifications marked as read', modifiedCount: result.modifiedCount });
}));

// POST /notifications
// Create a new notification for the authenticated user
router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { message, type } = req.body;

  console.log(`Creating new notification for User ID=${userId}: message="${message}", type="${type}"`);

  if (!message) {
    throw new ValidationError('Message is required');
  }

  // Use the sendNotification service to create and emit the notification
  const notification = await sendNotification(userId, message, type || 'other');

  console.log(`Notification created and sent successfully for User ID=${userId}`);
  res.status(201).json({ 
    message: 'Notification created and sent successfully',
    notification
  });
}));

module.exports = router
