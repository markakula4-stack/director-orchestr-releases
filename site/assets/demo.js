/* A browser-only illustration. This demo never sends commands to an AI service. */
(function () {
  'use strict';

  const TOTAL = 3;
  const initialState = () => ({ phase: 'idle', completed: 0 });
  const stepName = index => 'P' + String(index + 1).padStart(2, '0');

  function transition(state, action) {
    switch (action.type) {
      case 'RESET':
        return initialState();
      case 'START':
        return state.phase === 'idle' || state.phase === 'completed'
          ? { phase: 'running', completed: 0 }
          : state;
      case 'CONFIRM': {
        // A repeated confirmation for an older step cannot advance the queue.
        if (state.phase !== 'running' || action.step !== state.completed) return state;
        const completed = state.completed + 1;
        return { phase: completed === TOTAL ? 'completed' : 'running', completed };
      }
      case 'QUESTION':
        return state.phase === 'running' ? { ...state, phase: 'paused' } : state;
      case 'RESUME':
        return state.phase === 'paused' ? { ...state, phase: 'running' } : state;
      default:
        return state;
    }
  }

  // The reducer is also testable with Node, without a browser or dependencies.
  if (typeof module === 'object' && module.exports) {
    module.exports = { initialState, transition };
  }
  if (typeof document === 'undefined') return;

  const root = document.getElementById('queue-demo');
  if (!root) return;
  const primary = root.querySelector('#demo-primary');
  const question = root.querySelector('#demo-question');
  const reset = root.querySelector('#demo-reset');
  const counter = root.querySelector('#demo-counter');
  const progress = root.querySelector('#demo-progress');
  const status = root.querySelector('#demo-status');
  const rows = Array.from(root.querySelectorAll('li[data-step]'));
  if (!primary || !question || !reset || !counter || !progress || !status || rows.length !== TOTAL) return;

  let state = initialState();

  function render() {
    root.dataset.state = state.phase;
    counter.textContent = String(state.completed);
    progress.max = TOTAL;
    progress.value = state.completed;
    progress.setAttribute('aria-label', 'Подтверждённые этапы примера');
    progress.setAttribute('aria-valuetext', state.completed + ' из ' + TOTAL);
    question.disabled = state.phase !== 'running';
    reset.disabled = state.phase === 'idle';
    primary.disabled = false;

    const messages = {
      idle: 'Учебный пример. Сообщения в чат не отправляются.',
      running: 'Пример: ожидаем подтверждение ' + stepName(state.completed) + '.',
      paused: 'Пример на паузе: нужен ответ пользователя.',
      completed: 'Пример завершён: все 3 этапа подтверждены.'
    };
    const labels = {
      idle: 'Запустить пример',
      running: 'Подтвердить ' + stepName(state.completed),
      paused: 'Продолжить пример',
      completed: 'Повторить пример'
    };
    primary.textContent = labels[state.phase];
    status.textContent = messages[state.phase];

    rows.forEach(row => {
      const index = Number(row.dataset.step);
      let rowState = 'pending';
      if (index < state.completed) rowState = 'done';
      else if (index === state.completed && state.phase === 'running') rowState = 'active';
      else if (index === state.completed && state.phase === 'paused') rowState = 'paused';
      row.dataset.state = rowState;
      if (rowState === 'active' || rowState === 'paused') row.setAttribute('aria-current', 'step');
      else row.removeAttribute('aria-current');
      const symbol = row.querySelector('.step-symbol');
      const description = row.querySelector('.step-description');
      if (symbol) symbol.textContent = rowState === 'done' ? '✓' : String(index + 1).padStart(2, '0');
      if (description) {
        description.textContent = {
          done: 'Подтверждён в примере',
          active: 'Ожидает подтверждения',
          paused: 'Ждёт твоего решения',
          pending: state.phase === 'idle' && index === 0 ? 'Готов к запуску' : 'В очереди'
        }[rowState];
      }
    });
  }

  function dispatch(action) {
    const next = transition(state, action);
    if (next === state) return;
    state = next;
    render();
  }

  primary.addEventListener('click', event => {
    // A mouse double-click is one deliberate action, not two different stages.
    if (event.detail > 1) return;
    if (state.phase === 'running') dispatch({ type: 'CONFIRM', step: state.completed });
    else if (state.phase === 'paused') dispatch({ type: 'RESUME' });
    else dispatch({ type: 'START' });
  });
  question.addEventListener('click', () => dispatch({ type: 'QUESTION' }));
  reset.addEventListener('click', () => dispatch({ type: 'RESET' }));
  [primary, question, reset].forEach(button => {
    button.addEventListener('keydown', event => {
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    });
  });
  render();
})();
