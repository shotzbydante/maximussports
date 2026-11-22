/**
 * RobotAvatar — the old name for the user avatar, kept so every list, chip
 * and row that already renders one picks up the 2D Maximus without changes.
 * It takes the stored config fields as props and hands them to MaximusAvatar.
 * New code should use MaximusAvatar directly.
 */
import MaximusAvatar from './MaximusAvatar';
import { DEFAULT_AVATAR } from '../../brand/avatar';

export const DEFAULT_ROBOT_CONFIG = DEFAULT_AVATAR;

export default function RobotAvatar({ jerseyNumber = '', robotColor, mascotType, size = 120, className = '', crop }) {
  // A row with a colour but no sport is a first-generation (basketball) avatar.
  const legacy = !mascotType && robotColor;
  const config = {
    type: legacy ? 'maximus_robot' : 'maximus_2d',
    mascotType,
    robotColor,
    jerseyNumber,
  };
  return <MaximusAvatar config={config} size={size} className={className} crop={crop} />;
}
