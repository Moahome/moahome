import { NeighborhoodIllustration } from '@/shared/ui/neighborhood-illustration';
import { WelcomePuppy } from '../welcome-puppy/welcomePuppy';
import motion from '../../startMotion.module.css';
import styles from './startIntro.module.css';

export function StartIntro({ additional = false, canCreateProperty = true }: { additional?: boolean; canCreateProperty?: boolean }) {
  const additionalTitle = canCreateProperty ? '등록 및 참여' : '참여하기';
  const additionalDescription = canCreateProperty
    ? '새로운 관리대상을 만들거나 받은 초대코드로 참여해주세요.'
    : '받은 초대코드로 참여하거나 참여 중인 곳을 선택해주세요.';
  return (
    <section
      className={`${styles.intro} ${motion.reveal}`}
      aria-labelledby={'home-title'}
    >
      <h1
        id={'home-title'}
      >
        {additional ? additionalTitle : '모아홈을 시작해 보세요!'}
        <WelcomePuppy />
      </h1>
      <p
        className={styles['desktop-description']}
      >
        {additional ? additionalDescription : '받은 초대코드로 우리 집에 참여해보세요.'}
      </p>
      <p
        className={styles['mobile-description']}
      >
        {additional ? '원하는 방법을 선택해주세요.' : '어떻게 시작할지 선택해주세요.'}
      </p>
      <p
        className={styles['mobile-support']}
      >
        모아홈이 더 편리한
        <br />
        주거 생활을 도와드립니다.
      </p>
      <div
        className={styles['intro-illustration']}
      >
        <NeighborhoodIllustration />
      </div>
      <p
        className={styles['intro-motto']}
        aria-hidden={'true'}
      >
        좋은 이웃,
        <br />
        더 좋은 일상
      </p>
    </section>
  );
}
