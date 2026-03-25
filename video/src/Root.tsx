import { Composition, Sequence, Audio, staticFile, interpolate, useCurrentFrame } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import {
  FPS,
  WIDTH,
  HEIGHT,
  SCENE_DURATIONS,
  TOTAL_FRAMES,
  AUDIO as AUDIO_PATHS,
} from './constants';
import { HookScene } from './scenes/HookScene';
import { ProblemScene } from './scenes/ProblemScene';
import { SolutionScene } from './scenes/SolutionScene';
import { DashboardShowcase } from './scenes/DashboardShowcase';
import { TrustScoreScene } from './scenes/TrustScoreScene';
import { ScannerScene } from './scenes/ScannerScene';
import { CloseScene } from './scenes/CloseScene';
import { SocialClip } from './SocialClip';

const TRANSITION_FRAMES = 15;

const SCENES = [
  { id: 'hook', Component: HookScene, duration: SCENE_DURATIONS.hook },
  { id: 'problem', Component: ProblemScene, duration: SCENE_DURATIONS.problem },
  { id: 'solution', Component: SolutionScene, duration: SCENE_DURATIONS.solution },
  { id: 'multichain', Component: DashboardShowcase, duration: SCENE_DURATIONS.multichain },
  { id: 'trustscore', Component: TrustScoreScene, duration: SCENE_DURATIONS.trustscore },
  { id: 'scanner', Component: ScannerScene, duration: SCENE_DURATIONS.scanner },
  { id: 'close', Component: CloseScene, duration: SCENE_DURATIONS.close },
] as const;

const AUDIO_MAP: Record<string, string> = {
  hook: AUDIO_PATHS.hook,
  problem: AUDIO_PATHS.problem,
  solution: AUDIO_PATHS.solution,
  multichain: AUDIO_PATHS.multichain,
  trustscore: AUDIO_PATHS.trustscore,
  scanner: AUDIO_PATHS.scanner,
  close: AUDIO_PATHS.close,
};

// Audio layer with volume fade to prevent overlap during transitions
const SceneAudio = ({ src, sceneDuration, isLast }: { src: string; sceneDuration: number; isLast: boolean }) => {
  const frame = useCurrentFrame();
  const fadeOutStart = sceneDuration - TRANSITION_FRAMES;
  const volume = isLast
    ? 1
    : interpolate(frame, [fadeOutStart, sceneDuration], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
  return <Audio src={src} volume={volume} />;
};

const MainVideo = () => {
  let audioOffset = 0;

  return (
    <>
      <TransitionSeries>
        {SCENES.flatMap((scene, i) => {
          const isLast = i === SCENES.length - 1;
          const elements = [
            <TransitionSeries.Sequence key={scene.id} durationInFrames={scene.duration}>
              <scene.Component />
            </TransitionSeries.Sequence>,
          ];
          if (!isLast) {
            elements.push(
              <TransitionSeries.Transition
                key={`t-${scene.id}`}
                presentation={fade()}
                timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
              />,
            );
          }
          return elements;
        })}
      </TransitionSeries>

      {/* Audio layers — sequential with volume fades to prevent overlap */}
      {SCENES.map((scene, i) => {
        const from = audioOffset;
        const isLast = i === SCENES.length - 1;
        audioOffset += scene.duration - (isLast ? 0 : TRANSITION_FRAMES);
        return (
          <Sequence key={`audio-${scene.id}`} from={from} durationInFrames={scene.duration}>
            <SceneAudio
              src={staticFile(AUDIO_MAP[scene.id])}
              sceneDuration={scene.duration}
              isLast={isLast}
            />
          </Sequence>
        );
      })}
    </>
  );
};

export const Root = () => {
  const transitionOverlap = TRANSITION_FRAMES * (SCENES.length - 1);
  const totalWithTransitions = TOTAL_FRAMES - transitionOverlap;

  return (
    <>
      <Composition
        id="Main"
        component={MainVideo}
        durationInFrames={totalWithTransitions}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="Social"
        component={SocialClip}
        durationInFrames={12 * FPS}
        fps={FPS}
        width={1080}
        height={1920}
      />
    </>
  );
};
