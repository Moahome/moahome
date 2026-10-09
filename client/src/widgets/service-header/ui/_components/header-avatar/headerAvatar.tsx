import Image from 'next/image';
import type { CurrentUser } from '@/entities/session';
import { ServiceIcon } from '@/shared/ui/service-icon';
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
      {user.profileImageUrl ? (
        <Image
          src={user.profileImageUrl}
          alt={''}
          width={44}
          height={44}
          unoptimized
        />
      ) : (
        <ServiceIcon
          name={'person'}
        />
      )}
    </span>
  );
}
