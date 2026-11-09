import type { EditorState } from './engine.ts';

const clone = (state: EditorState): EditorState => ({
  value: state.value,
  selections: state.selections.map((s) => ({ ...s })),
});

/** Cursor snapshots accompany the browser's text undo stack, including grouped typing. */
export class NativeHistory {
  private states: EditorState[] = [];
  private index = -1;

  reset(state: EditorState): void {
    this.states = [clone(state)];
    this.index = 0;
  }

  record(state: EditorState): void {
    if (this.states[this.index]?.value === state.value) {
      this.states[this.index] = clone(state);
      return;
    }
    this.states.splice(this.index + 1);
    this.states.push(clone(state));
    this.index = this.states.length - 1;
  }

  restore(value: string, redo: boolean): EditorState | undefined {
    for (
      let i = this.index + (redo ? 1 : -1);
      i >= 0 && i < this.states.length;
      i += redo ? 1 : -1
    ) {
      if (this.states[i].value === value) {
        this.index = i;
        return clone(this.states[i]);
      }
    }
  }
}
