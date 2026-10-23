import { createRouter } from './http';
import { authRoutes } from './auth';
import { studentRoutes } from './students';
import { groupRoutes } from './groups';
import { calendarRoutes } from './calendar';
import { feedbackRoutes } from './feedback';
import { bookRoutes } from './books';
import { homeRoutes } from './home';
import { consultRoutes } from './consults';

export const dispatch = createRouter([
  ...authRoutes,
  ...studentRoutes,
  ...groupRoutes,
  ...calendarRoutes,
  ...feedbackRoutes,
  ...bookRoutes,
  ...homeRoutes,
  ...consultRoutes,
]);
