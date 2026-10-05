import Image from 'next/image';
import type { CurrentUser } from '@/entities/session';
import { StartIcon } from '../start-icon/startIcon';
import styles from './startAvatar.module.css';

export function StartAvatar({
  user,
}: {
  user: Pick<CurrentUser, 'profileImageUrl'>;
}) {
  return (
    <span
      className={styles.avatar}
    >
      {user.profileImageUrl ? (
        <Image
          src={user.profileImageUrl}
          alt={''}
          width={44}
          height={44}
          unoptimized
        />
      ) : (
        <StartIcon
          name={'person'}
        />
      )}
    </span>
  );
}
