/**
 * Official Design System Tokens
 * University Computer Monitoring System
 * 
 * Based on the UI/UX Design Guide
 */

export const designTokens = {
  // === COLORS ===
  colors: {
    primary: 'hsl(221, 83%, 53%)',      // Info Blue
    success: 'hsl(142, 71%, 45%)',      // Success Green
    warning: 'hsl(48, 96%, 53%)',       // Warning Yellow
    error: 'hsl(0, 84%, 60%)',          // Error Red
    info: 'hsl(221, 83%, 53%)',         // Info Blue
    neutral: 'hsl(215, 16%, 47%)',      // Muted Gray
  },

  // === PERFORMANCE GRADES ===
  grades: {
    A: 'hsl(142, 71%, 45%)',  // Vibrant Green - Excellent
    B: 'hsl(142, 71%, 55%)',  // Light Green - Good
    C: 'hsl(60, 70%, 50%)',   // Yellow-Green - Fair
    D: 'hsl(38, 92%, 50%)',   // Orange-Yellow - Poor
    F: 'hsl(0, 84%, 60%)',    // Bold Red - Critical
  },

  // === SPACING (8px grid) ===
  spacing: {
    hairline: '0.125rem',  // 2px
    tiny: '0.25rem',       // 4px
    small: '0.5rem',       // 8px
    compact: '0.75rem',    // 12px
    base: '1rem',          // 16px
    medium: '1.5rem',      // 24px
    large: '2rem',         // 32px
    xl: '3rem',            // 48px
    xxl: '4rem',           // 64px
  },

  // === BORDER RADIUS ===
  borderRadius: {
    none: '0',
    sm: '0.25rem',    // 4px - Badges, tags
    md: '0.5rem',     // 8px - Buttons, inputs, cards
    lg: '0.75rem',    // 12px - Modals, dialogs
    full: '9999px',   // Pills, circular
  },

  // === SHADOWS ===
  shadows: {
    sm: '0 1px 3px rgba(0, 0, 0, 0.1)',
    md: '0 4px 12px rgba(0, 0, 0, 0.1)',
    lg: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    hover: '0 4px 12px rgba(0, 0, 0, 0.1)',
  },

  // === TYPOGRAPHY ===
  typography: {
    h1: '2.5rem',      // 40px - Page titles
    h2: '2rem',        // 32px - Section headers
    h3: '1.5rem',      // 24px - Subsection headers
    h4: '1.25rem',     // 20px - Card titles
    h5: '1.125rem',    // 18px - Labels
    h6: '1rem',        // 16px - Small headers
    body: '1rem',      // 16px - Body text
    small: '0.875rem', // 14px - Metadata
  },

  // === TRANSITIONS ===
  transitions: {
    snappy: '150ms cubic-bezier(0.4, 0.0, 0.2, 1)',  // Immediate feedback
    smooth: '200ms cubic-bezier(0.4, 0.0, 0.2, 1)',  // Smooth status updates
    gentle: '300ms ease-out',                         // Comfortable repositioning
    page: '400ms ease-out',                           // Smooth navigation
  },

  // === CHART COLORS ===
  chartColors: [
    'hsl(221, 83%, 53%)',   // Blue
    'hsl(142, 71%, 45%)',   // Green
    'hsl(48, 96%, 53%)',    // Yellow
    'hsl(262, 80%, 60%)',   // Purple
    'hsl(0, 84%, 60%)',     // Red
    'hsl(189, 94%, 43%)',   // Cyan
    'hsl(38, 92%, 50%)',    // Orange
    'hsl(173, 80%, 40%)',   // Teal
  ],
}

/**
 * Get color for resource usage percentage
 * @param percentage - Usage percentage (0-100)
 * @returns Color string for the given percentage
 */
export function getResourceColor(percentage: number): string {
  if (percentage <= 60) return 'hsl(var(--success))' // Green - Healthy
  if (percentage <= 85) return 'hsl(var(--warning))' // Yellow - Warning
  return 'hsl(var(--error))'                          // Red - Critical
}

/**
 * Get color for performance grade
 * @param grade - Performance grade (A-F)
 * @returns Color string for the grade
 */
export function getGradeColor(grade: string): string {
  const gradeMap: Record<string, string> = {
    'A': 'hsl(var(--grade-a))',
    'B': 'hsl(var(--grade-b))',
    'C': 'hsl(var(--grade-c))',
    'D': 'hsl(var(--grade-d))',
    'F': 'hsl(var(--grade-f))',
  }
  return gradeMap[grade] || gradeMap['F']
}

/**
 * Get class name for status badge
 * @param status - Status string
 * @returns CSS class name
 */
export function getStatusClass(status: string): string {
  const statusMap: Record<string, string> = {
    'online': 'status-online',
    'healthy': 'status-healthy',
    'warning': 'status-warning',
    'critical': 'status-critical',
    'offline': 'status-offline',
    'maintenance': 'status-maintenance',
  }
  return statusMap[status.toLowerCase()] || 'status-offline'
}

/**
 * Get class name for grade badge
 * @param grade - Performance grade (A-F)
 * @returns CSS class name
 */
export function getGradeClass(grade: string): string {
  return `grade-${grade.toLowerCase()}`
}

/**
 * Format number with commas for thousands
 * @param num - Number to format
 * @returns Formatted string
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US')
}

/**
 * Format percentage with 1 decimal place
 * @param num - Number to format
 * @returns Formatted percentage string
 */
export function formatPercentage(num: number): string {
  return `${num.toFixed(1)}%`
}

/**
 * Get stagger delay for card entrance animation
 * @param index - Card index
 * @returns Delay in milliseconds
 */
export function getStaggerDelay(index: number): number {
  return index * 50 // 50ms delay between each card
}
