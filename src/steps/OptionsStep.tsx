import { useEffect, useState } from 'preact/hooks';
import type { MatrixClient } from '../lib/matrix';
import type { TargetKind } from '../lib/pipeline';
import { t, useLocale, type I18nKey } from '../i18n';

export interface OptionsState {
  targets: Record<TargetKind, boolean>;
  convertAnimated: boolean;
  roomMode: { kind: 'create' } | { kind: 'existing'; roomId: string };
}

interface RoomOption {
  id: string;
  name: string;
}

interface Props {
  matrix: MatrixClient | null;
  options: OptionsState;
  onOptions: (options: OptionsState) => void;
}

export const defaultOptions = (): OptionsState => ({
  targets: { user: false, room: false, zip: false, fluffy: false },
  convertAnimated: true,
  roomMode: { kind: 'create' },
});

export function optionsError(options: OptionsState, matrix: MatrixClient | null): I18nKey | null {
  const { user, room, zip, fluffy } = options.targets;
  if (!user && !room && !zip && !fluffy) return 'options.errNone';
  if ((user || room) && !matrix) return 'options.errMatrix';
  if (room && options.roomMode.kind === 'existing' && !options.roomMode.roomId) {
    return 'options.errRoom';
  }
  return null;
}

const TARGET_TEXT: Record<
  TargetKind,
  { title: I18nKey; desc: I18nKey; requiresMatrix: boolean }
> = {
  user: { title: 'options.targetUserTitle', desc: 'options.targetUserDesc', requiresMatrix: true },
  room: {
    title: 'options.targetRoomTitle',
    desc: 'options.targetRoomDesc',
    requiresMatrix: true,
  },
  zip: { title: 'options.targetZipTitle', desc: 'options.targetZipDesc', requiresMatrix: false },
  fluffy: {
    title: 'options.targetFluffyTitle',
    desc: 'options.targetFluffyDesc',
    requiresMatrix: false,
  },
};

export function OptionsStep(props: Props) {
  useLocale();
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const options = props.options;
  const matrixNeeded = options.targets.user || options.targets.room;

  const update = (patch: Partial<OptionsState>): void => {
    props.onOptions({ ...options, ...patch });
  };

  const toggleTarget = (kind: TargetKind, checked: boolean): void => {
    update({ targets: { ...options.targets, [kind]: checked } });
  };

  const loadRooms = async (): Promise<void> => {
    if (!props.matrix) return;
    setRoomsLoading(true);
    setRoomsError(null);
    try {
      const ids = await props.matrix.joinedRooms();
      const limited = ids.slice(0, 40);
      const withNames = await Promise.all(
        limited.map(async (id) => ({
          id,
          name: (await props.matrix!.roomName(id)) ?? id,
        })),
      );
      setRooms(withNames);
    } catch (error) {
      setRoomsError(error instanceof Error ? error.message : String(error));
    } finally {
      setRoomsLoading(false);
    }
  };

  useEffect(() => {
    if (options.roomMode.kind === 'existing' && rooms.length === 0 && props.matrix) {
      void loadRooms();
    }
  }, [options.roomMode.kind]);

  const targetRow = (kind: TargetKind) => {
    const { title, desc, requiresMatrix } = TARGET_TEXT[kind];
    const disabled = requiresMatrix && !props.matrix;
    return (
      <label class={`checkbox${disabled ? ' disabled' : ''}`}>
        <input
          type="checkbox"
          checked={options.targets[kind] && !disabled}
          disabled={disabled}
          onChange={(e) => toggleTarget(kind, (e.currentTarget as HTMLInputElement).checked)}
        />
        <span>
          <div class="title">{t(title)}</div>
          <div class="desc">
            {t(desc)}
            {disabled && t('options.needMatrixSuffix')}
          </div>
        </span>
      </label>
    );
  };

  return (
    <div class="card">
      <h2>{t('options.title')}</h2>
      <p class="sub">{t('options.sub')}</p>

      {targetRow('room')}
      {targetRow('user')}
      <div class="output-group-label">{t('options.zipGroup')}</div>
      {targetRow('zip')}
      {targetRow('fluffy')}

      {matrixNeeded && !props.matrix && (
        <div class="status error">{t('options.returnConnect')}</div>
      )}

      {options.targets.room && (
        <>
          <hr class="divider" />
          <div class="field">
            <label>{t('options.roomLocation')}</label>
            <label class="checkbox" style="margin-bottom:8px">
              <input
                type="radio"
                name="room-mode"
                checked={options.roomMode.kind === 'create'}
                onChange={() => update({ roomMode: { kind: 'create' } })}
              />
              <span>
                <div class="title">{t('options.roomCreateTitle')}</div>
                <div class="desc">{t('options.roomCreateDesc')}</div>
              </span>
            </label>
            <label class="checkbox">
              <input
                type="radio"
                name="room-mode"
                checked={options.roomMode.kind === 'existing'}
                onChange={() => update({ roomMode: { kind: 'existing', roomId: '' } })}
              />
              <span>
                <div class="title">{t('options.roomExistingTitle')}</div>
                <div class="desc">{t('options.roomExistingDesc')}</div>
              </span>
            </label>

            {options.roomMode.kind === 'existing' && (
              <div class="field" style="margin-top:8px">
                <select
                  value={options.roomMode.roomId}
                  onChange={(e) =>
                    update({
                      roomMode: { kind: 'existing', roomId: (e.currentTarget as HTMLSelectElement).value },
                    })
                  }
                >
                  <option value="">
                    {roomsLoading
                      ? t('options.roomsLoading')
                      : rooms.length > 0
                        ? t('options.roomsPick')
                        : t('options.roomsNone')}
                  </option>
                  {rooms.map((room) => (
                    <option value={room.id}>
                      {room.name.length > 50 ? `${room.name.slice(0, 50)}…` : room.name}
                    </option>
                  ))}
                </select>
                <div class="hint">
                  <button type="button" onClick={loadRooms} disabled={roomsLoading} style="margin-top:6px">
                    {roomsLoading ? t('options.roomsRefreshing') : t('options.roomsRefresh')}
                  </button>
                  {roomsError && <span style="color:var(--error);margin-left:8px">{roomsError}</span>}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <hr class="divider" />

      <label class="checkbox">
        <input
          type="checkbox"
          checked={options.convertAnimated}
          onChange={(e) => update({ convertAnimated: (e.currentTarget as HTMLInputElement).checked })}
        />
        <span>
          <div class="title">{t('options.convertTitle')}</div>
          <div class="desc">{t('options.convertDesc')}</div>
        </span>
      </label>

      <p class="small">{t('options.attributionNote')}</p>
    </div>
  );
}
