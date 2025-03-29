// config/db.js

const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');
const { metrics } = require('../middleware/prometheusMiddleware');

// Track MongoDB operations for monitoring
const trackDbOperation = (operation, collection, success) => {
  // Increment database operations counter in Prometheus metrics
  metrics.dbOperationsTotal.inc({
    operation,
    collection,
    status: success ? 'success' : 'failure'
  });
};

// Setup MongoDB connection monitoring
const setupMongooseMonitoring = () => {
  const connection = mongoose.connection;
  
  // Log all MongoDB events
  connection.on('connected', () => {
    logger.info('MongoDB connected successfully');
  });
  
  connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
  
  connection.on('error', (err) => {
    logger.error('MongoDB connection error', { error: err.message, stack: err.stack });
  });
  
  connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });
  
  // Monitor Mongoose operations - could be extended further if needed
  mongoose.plugin((schema) => {
    // Add hooks to track operations
    ['save', 'findOne', 'find', 'update', 'remove'].forEach((operation) => {
      schema.pre(operation, function() {
        const collection = this.constructor.modelName || 'unknown';
        logger.debug(`MongoDB ${operation} operation started`, { collection });
      });
      
      schema.post(operation, function(result) {
        const collection = this.constructor.modelName || 'unknown';
        logger.debug(`MongoDB ${operation} operation completed`, { 
          collection,
          success: !!result
        });
        trackDbOperation(operation, collection, !!result);
      });
      
      schema.post(operation, function(error) {
        if (error) {
          const collection = this.constructor.modelName || 'unknown';
          logger.error(`MongoDB ${operation} operation failed`, { 
            collection,
            error: error.message,
            stack: error.stack
          });
          trackDbOperation(operation, collection, false);
        }
      });
    });
  });
};

const connectDB = async () => {
  try {
    // Setup monitoring before connecting
    setupMongooseMonitoring();
    
    // Connect to MongoDB with enhanced logging
    logger.info('Connecting to MongoDB', { uri: config.db.uri });
    
    await mongoose.connect(config.db.uri, config.db.options);
    
    logger.info('MongoDB connected successfully', { 
      host: mongoose.connection.host,
      name: mongoose.connection.name 
    });
    
    // Get some basic MongoDB stats
    const stats = await mongoose.connection.db.stats();
    logger.debug('MongoDB stats', { 
      collections: stats.collections,
      objects: stats.objects,
      avgObjSize: stats.avgObjSize,
      dataSize: `${(stats.dataSize / (1024 * 1024)).toFixed(2)} MB`,
      storageSize: `${(stats.storageSize / (1024 * 1024)).toFixed(2)} MB`,
    });
    
  } catch (error) {
    logger.error('MongoDB connection error', { 
      error: error.message, 
      stack: error.stack 
    });
    process.exit(1);
  }
};

module.exports = connectDB;
