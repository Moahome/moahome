import { NeighborhoodIllustration } from '@/shared/ui/neighborhood-illustration';
import { WelcomePuppy } from '../welcome-puppy/welcomePuppy';
import motion from '../../start-page/startMotion.module.css';
import styles from './startIntro.module.css';

export function StartIntro() {
  return (
    <section
      className={`${styles.intro} ${motion.reveal}`}
      aria-labelledby={'home-title'}
    >
      <h1
        id={'home-title'}
      >
        모아홈을 시작해 보세요!
        <WelcomePuppy />
      </h1>
      <p
        className={styles['desktop-description']}
      >
        모아홈을 시작하려면 아래에서 원하는 방법을 선택해주세요.
      </p>
      <p
        className={styles['mobile-description']}
      >
        어떻게 시작할지 선택해주세요.
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
