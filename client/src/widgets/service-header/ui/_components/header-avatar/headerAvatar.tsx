import {
  ProfileAvatar,
  type CurrentUser
} from '@/entities/session';
import styles from './headerAvatar.module.css';

export function HeaderAvatar({
  user,
}: {
  user: Pick<CurrentUser, 'profileImageUrl'>;
}) {
  return (
    <span
      className={styles.avatar}
    >
      <ProfileAvatar
        imageUrl={user.profileImageUrl}
      />
    </span>
  );
}
