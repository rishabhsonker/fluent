/**
 * CSS Constants - Centralized styling values
 * 
 * Purpose:
 * - Single source of truth for all CSS magic numbers
 * - Ensures consistency across stylesheets
 * - Makes design system changes easier
 * 
 * Usage:
 * - Import these constants in TypeScript files that generate dynamic styles
 * - Reference in CSS files via CSS custom properties (future enhancement)
 * 
 * Categories:
 * - COLORS: Color values with opacity
 * - SPACING: Padding, margins, gaps
 * - DIMENSIONS: Widths, heights, sizes
 * - ANIMATIONS: Durations, delays, easing
 * - Z_INDEX: Layering values
 * - TYPOGRAPHY: Font sizes, line heights
 * - BORDERS: Radius values, widths
 */

import { NUMERIC } from '../constants';

// Color constants with opacity variations
export const CSS_COLORS = {
  HIGHLIGHT: {
    BASE: 'rgba(255, 20, 147, 0.25)', // Neon pink highlighter
    HOVER: 'rgba(255, 20, 147, 0.4)',  // Stronger on hover
    FOCUS_OUTLINE: '#BF40BF',          // Purple outline for keyboard focus
  },
  TOOLTIP: {
    BACKGROUND: '#1f2937',
    TEXT: 'white',
    TRANSLATION: '#60a5fa',
    PRONUNCIATION: '#9ca3af',
    EXAMPLE_ENGLISH: '#e5e7eb',
    EXAMPLE_TRANSLATED: '#60a5fa',
    ERROR: '#f87171',
    ERROR_BG: 'rgba(248, 113, 113, 0.1)',
    CONTEXT_EXAMPLE: '#93c5fd',
    CONTEXT_TIP: '#fbbf24',
    CONTEXT_TIP_STRONG: '#f59e0b',
  },
  PROGRESS: {
    BACKGROUND: '#374151',
    FILL: '#3b82f6',
    SUCCESS: '#10b981',
    WARNING: '#f59e0b',
  },
  CONTROL: {
    BUTTON_BG: 'white',
    BUTTON_BORDER: '#e5e7eb',
    BUTTON_ICON: '#374151',
    MENU_BG: 'white',
    LANG_ACTIVE_BG: '#eff6ff',
    LANG_ACTIVE_BORDER: '#3b82f6',
    LANG_ACTIVE_TEXT: '#2563eb',
  },
  POPUP: {
    BACKGROUND: '#ffffff',
    BACKGROUND_ALT: '#f9fafb',
    BORDER: '#e5e7eb',
    TEXT_PRIMARY: '#1f2937',
    TEXT_SECONDARY: '#6b7280',
    BUTTON_PRIMARY: '#3b82f6',
    BUTTON_PRIMARY_HOVER: '#2563eb',
    BUTTON_DANGER: '#ef4444',
    BUTTON_DANGER_HOVER: '#dc2626',
    BUTTON_SECONDARY: '#f3f4f6',
    BUTTON_SECONDARY_HOVER: '#e5e7eb',
    SUCCESS: '#10b981',
    WARNING: '#f59e0b',
  },
} as const;

// Spacing values in pixels
export const CSS_SPACING = {
  // Tooltip spacing
  TOOLTIP_PADDING_V: 16,
  TOOLTIP_PADDING_H: 20,
  TOOLTIP_MARGIN_BOTTOM: 8,
  TOOLTIP_SECTION_GAP: 12,
  
  // Control widget spacing
  CONTROL_MENU_PADDING: 12,
  CONTROL_MENU_GAP: 6,
  CONTROL_BUTTON_PADDING: 10,
  
  // Popup spacing
  POPUP_HEADER_PADDING: '24px 24px 16px',
  POPUP_SECTION_PADDING: '20px 24px',
  POPUP_FOOTER_PADDING: '16px 24px',
  POPUP_MODAL_PADDING: 20,
  
  // General spacing
  SMALL: 4,
  MEDIUM: 8,
  LARGE: 16,
  XL: 24,
} as const;

// Dimension values in pixels
export const CSS_DIMENSIONS = {
  // Tooltip dimensions
  TOOLTIP_MIN_WIDTH: 280,
  TOOLTIP_MAX_WIDTH: 360,
  TOOLTIP_ARROW_SIZE: 12,
  TOOLTIP_ARROW_OFFSET: -6,
  
  // Control widget dimensions
  CONTROL_BUTTON_SIZE: 56,
  CONTROL_BUTTON_SIZE_SMALL: 42,
  CONTROL_ICON_SIZE: 24,
  CONTROL_MENU_MIN_WIDTH: 280,
  CONTROL_FLAG_SIZE: 28,
  
  // Popup dimensions
  POPUP_WIDTH: 350,
  POPUP_MIN_HEIGHT: 400,
  POPUP_MODAL_MAX_WIDTH: 320,
  POPUP_MODAL_MAX_HEIGHT: '80vh',
  POPUP_BLACKLIST_MAX_HEIGHT: 200,
  
  // Progress bar dimensions
  PROGRESS_BAR_HEIGHT: 4,
  RATE_LIMIT_BAR_HEIGHT: 8,
  
  // Icon sizes
  ICON_SMALL: 16,
  ICON_MEDIUM: 20,
  ICON_LARGE: 24,
} as const;

// Animation values
export const CSS_ANIMATIONS = {
  // Durations in seconds
  DURATION_FAST: 0.2,
  DURATION_NORMAL: 0.3,
  DURATION_SKELETON: 1.8,
  
  // Transition timing
  EASE_DEFAULT: 'ease',
  EASE_IN_OUT: 'ease-in-out',
  
  // Specific animations
  TOOLTIP_TRANSITION: 'opacity 0.2s ease, transform 0.2s ease',
  HIGHLIGHT_TRANSITION: 'all 0.2s ease',
  BUTTON_TRANSITION: 'all 0.2s ease',
  PROGRESS_TRANSITION: 'width 0.3s ease, background-color 0.3s ease',
  
  // Transform values
  SCALE_HOVER: 1.05,
  SCALE_ACTIVE: 0.95,
  TRANSLATE_Y_HIDDEN: 4,
  TRANSLATE_Y_MENU: 10,
} as const;

// Z-index layering
export const CSS_Z_INDEX = {
  TOOLTIP: 2147483647,      // Maximum z-index (2^31 - 1)
  CONTROL: 2147483646,       // Just below tooltip
  POPUP_MODAL: 1000,         // Modal overlay
  NOTIFICATION: 10000,       // Notifications
  PAGE_CONTROL: 9998,        // Page control widget
  TOOLTIP_ARROW: -1,         // Behind tooltip content
} as const;

// Typography values
export const CSS_TYPOGRAPHY = {
  // Font sizes in pixels
  SIZE_XS: 11,
  SIZE_SM: 12,
  SIZE_BASE: 14,
  SIZE_MD: 16,
  SIZE_LG: 18,
  SIZE_XL: 24,
  SIZE_XXL: 28,
  
  // Line heights
  LINE_HEIGHT_TIGHT: 1.4,
  LINE_HEIGHT_NORMAL: 1.5,
  LINE_HEIGHT_RELAXED: 1.6,
  
  // Font weights
  WEIGHT_NORMAL: 400,
  WEIGHT_MEDIUM: 500,
  WEIGHT_SEMIBOLD: 600,
  WEIGHT_BOLD: 700,
  
  // Letter spacing
  LETTER_SPACING_TIGHT: '0.05em',
} as const;

// Border values
export const CSS_BORDERS = {
  // Border radius in pixels
  RADIUS_SM: 2,
  RADIUS_BASE: 3,
  RADIUS_MD: 4,
  RADIUS_LG: 6,
  RADIUS_XL: 8,
  RADIUS_XXL: 12,
  RADIUS_FULL: '50%',
  
  // Border widths
  WIDTH_THIN: 1,
  WIDTH_MEDIUM: 2,
  
  // Outline
  OUTLINE_WIDTH: 2,
  OUTLINE_OFFSET: 2,
} as const;

// Opacity values
export const CSS_OPACITY = {
  TRANSPARENT: 0,
  LOW: 0.3,
  MEDIUM: 0.5,
  HIGH: 0.7,
  FULL: 1,
  
  // Specific use cases
  SEPARATOR: 0.7,
  DISABLED: 0.5,
  BACKGROUND_OVERLAY: 0.1,
  MODAL_OVERLAY: 0.5,
} as const;

// Shadow values
export const CSS_SHADOWS = {
  TOOLTIP: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  CONTROL_BUTTON: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  CONTROL_BUTTON_HOVER: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  MODAL: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
} as const;

// Media query breakpoints
export const CSS_BREAKPOINTS = {
  MOBILE: 480,
  TABLET: 768,
  DESKTOP: 1024,
  WIDE: 1280,
} as const;

// Grid values
export const CSS_GRID = {
  LANGUAGE_COLUMNS: 3,
  STATS_COLUMNS: 3,
  GAP_SMALL: 6,
  GAP_MEDIUM: 8,
  GAP_LARGE: 16,
} as const;

// Specific component values
export const CSS_COMPONENTS = {
  // Highlight padding
  HIGHLIGHT_PADDING_V: '0.1em',
  HIGHLIGHT_PADDING_H: '0.2em',
  HIGHLIGHT_MARGIN: '0 0.1em',
  
  // Skeleton loading
  SKELETON_MIN_WIDTH: 140,
  SKELETON_FULL_MIN_WIDTH: 220,
  SKELETON_PADDING: '4px 8px',
  SKELETON_GRADIENT_SIZE: '200%',
  
  // Tooltip specific
  TOOLTIP_TRANSFORM_HIDDEN: 'translateY(4px)',
  TOOLTIP_TRANSFORM_VISIBLE: 'translateY(0)',
  
  // Progress bar widths (percentages)
  PROGRESS_STEPS: Array.from({length: 11}, (_, i) => i * NUMERIC.PERCENTAGE_MAX / NUMERIC.MINUTES_MEDIUM),
  
  // Control widget positions
  CONTROL_MENU_BOTTOM: 50,
  CONTROL_ADJUSTED_BOTTOM: 100,
  
  // Miscellaneous
  WORD_MAPPING_PADDING: '5px 8px',
  TOOLTIP_PRONUNCIATION_SEPARATOR_SIZE: 12,
  TOOLTIP_PRONUNCIATION_SEPARATOR_TOP: -2,
} as const;

// Export type definitions for TypeScript usage
export type CSSColorKey = keyof typeof CSS_COLORS;
export type CSSSpacingKey = keyof typeof CSS_SPACING;
export type CSSDimensionKey = keyof typeof CSS_DIMENSIONS;
export type CSSAnimationKey = keyof typeof CSS_ANIMATIONS;
export type CSSZIndexKey = keyof typeof CSS_Z_INDEX;
export type CSSTypographyKey = keyof typeof CSS_TYPOGRAPHY;
export type CSSBorderKey = keyof typeof CSS_BORDERS;
export type CSSOpacityKey = keyof typeof CSS_OPACITY;
export type CSSShadowKey = keyof typeof CSS_SHADOWS;
export type CSSBreakpointKey = keyof typeof CSS_BREAKPOINTS;
export type CSSGridKey = keyof typeof CSS_GRID;
export type CSSComponentKey = keyof typeof CSS_COMPONENTS;