// config/routingConfig.js
// Routing configuration with defaults (editable without redeploy)

/**
 * Get routing configuration (from DB or defaults)
 * @returns {Promise<Object>} Routing configuration
 */
async function getRoutingConfig() {
  // TODO: In the future, load from database (RoutingConfig model)
  // For now, use environment variables with defaults
  
  return {
    // Grade thresholds (score ranges)
    gradeThresholds: {
      A: {
        min: parseInt(process.env.ROUTING_GRADE_A_MIN) || 85,
        max: parseInt(process.env.ROUTING_GRADE_A_MAX) || 100
      },
      B: {
        min: parseInt(process.env.ROUTING_GRADE_B_MIN) || 70,
        max: parseInt(process.env.ROUTING_GRADE_B_MAX) || 84
      },
      C: {
        min: parseInt(process.env.ROUTING_GRADE_C_MIN) || 50,
        max: parseInt(process.env.ROUTING_GRADE_C_MAX) || 69
      },
      D: {
        min: parseInt(process.env.ROUTING_GRADE_D_MIN) || 30,
        max: parseInt(process.env.ROUTING_GRADE_D_MAX) || 49
      },
      Dead: {
        min: parseInt(process.env.ROUTING_GRADE_DEAD_MIN) || 0,
        max: parseInt(process.env.ROUTING_GRADE_DEAD_MAX) || 29
      }
    },
    
    // SLA hours per grade
    slaHours: {
      A: parseInt(process.env.ROUTING_SLA_A_HOURS) || 2,      // 2 hours for A-grade
      B: parseInt(process.env.ROUTING_SLA_B_HOURS) || 24,      // 24 hours for B-grade
      C: parseInt(process.env.ROUTING_SLA_C_HOURS) || 72,      // 72 hours for C-grade
      D: null,                                                // No SLA for D-grade
      Dead: null                                              // No SLA for Dead
    },
    
    // Alert channels enabled
    alertChannels: {
      sms: process.env.ROUTING_ALERT_SMS_ENABLED !== 'false',  // Default: true
      internal: process.env.ROUTING_ALERT_INTERNAL_ENABLED !== 'false'  // Default: true
    },
    
    // Quiet hours (no alerts during these times)
    quietHours: {
      enabled: process.env.ROUTING_QUIET_HOURS_ENABLED === 'true',  // Default: false
      startHour: parseInt(process.env.ROUTING_QUIET_HOURS_START) || 22,  // 10 PM
      endHour: parseInt(process.env.ROUTING_QUIET_HOURS_END) || 8    // 8 AM
    },
    
    // Major exclusions that prevent immediate closer routing
    majorExclusions: [
      'major fire damage',
      'extreme structural damage',
      'condemned',
      'uninhabitable',
      'total loss',
      'demolition required'
    ]
  };
}

/**
 * Check if current time is within quiet hours
 * @returns {Boolean} True if within quiet hours
 */
function isQuietHours() {
  const config = {
    enabled: process.env.ROUTING_QUIET_HOURS_ENABLED === 'true',
    startHour: parseInt(process.env.ROUTING_QUIET_HOURS_START) || 22,
    endHour: parseInt(process.env.ROUTING_QUIET_HOURS_END) || 8
  };
  
  if (!config.enabled) {
    return false;
  }
  
  const now = new Date();
  const currentHour = now.getHours();
  
  // Handle quiet hours that span midnight (e.g., 22:00 - 08:00)
  if (config.startHour > config.endHour) {
    return currentHour >= config.startHour || currentHour < config.endHour;
  } else {
    return currentHour >= config.startHour && currentHour < config.endHour;
  }
}

module.exports = {
  getRoutingConfig,
  isQuietHours
};

