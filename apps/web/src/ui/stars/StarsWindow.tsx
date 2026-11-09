import type { StarRating } from '@tower-magnate/shared';
import { useEffect } from 'preact/hooks';
import type { ClientStore } from '../../model/clientStore';
import type { GameState } from '../../model/gameState';
import { useStoreSelect } from '../../model/useStoreSelect';
import { Window } from '../kit/Window';
import { useWindowManager } from '../kit/WindowLayer';
import { formatCount } from '../status/statusFormat';
import { t } from '../strings';
import { populationProgress, starsView } from './starsModel';
import './starsWindow.css';

export const STARS_WINDOW_ID = 'stars';

interface StarsValues {
  stars: StarRating;
  population: number;
}

const selectStars = (state: GameState): StarsValues => ({
  stars: state.stars,
  population: state.population,
});

export interface StarsWindowProps {
  store: ClientStore;
  onClose: () => void;
}

export function StarsWindow({ store, onClose }: StarsWindowProps) {
  const manager = useWindowManager();
  const values = useStoreSelect(store, selectStars);
  useEffect(() => {
    manager.open({ id: STARS_WINDOW_ID, corner: 'topLeft' });
    return () => manager.close(STARS_WINDOW_ID);
  }, []);
  if (values === null) {
    return null;
  }
  const view = starsView(values.stars);
  const { next } = view;
  return (
    <Window id={STARS_WINDOW_ID} title={t('window.stars.title')} width={220} onClose={onClose}>
      <div class="stars-window">
        <p>{t(view.currentLabel, { n: values.stars })}</p>
        {next === null ? (
          <p>{t('window.stars.max')}</p>
        ) : (
          <>
            <p>{t(next.titleLabel, { n: next.rank ?? '' })}</p>
            <p>{t(next.requirement)}</p>
            <div
              class="stars-window__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={next.targetPopulation}
              aria-valuenow={Math.min(values.population, next.targetPopulation)}
            >
              <div
                class="stars-window__fill"
                style={{
                  width: `${populationProgress(values.population, next.targetPopulation) * 100}%`,
                }}
              />
            </div>
            <p class="stars-window__population">
              {t('window.stars.population', {
                n: formatCount(values.population),
                target: formatCount(next.targetPopulation),
              })}
            </p>
          </>
        )}
      </div>
    </Window>
  );
}
