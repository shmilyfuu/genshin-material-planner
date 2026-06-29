import { safeEval } from './core.mjs';

const WRAP_SELECTOR = '.item-input .input-wrap';

function adjustValue(input, delta) {
  const currentValue = safeEval(input.value);
  input.value = String(Math.max(0, currentValue + delta));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus({ preventScroll: true });
}

function createStepButton(input, label, direction, delta) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `number-step-button number-step-${direction}`;
  button.setAttribute('aria-label', `${label}${delta > 0 ? '增加 1' : '减少 1'}`);
  button.title = delta > 0 ? '增加 1' : '减少 1';

  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    adjustValue(input, delta);
  });

  return button;
}

function enhanceInputWrap(inputWrap) {
  if (!(inputWrap instanceof HTMLElement) || inputWrap.dataset.stepperReady === 'true') return;

  const input = inputWrap.querySelector('input');
  if (!(input instanceof HTMLInputElement)) return;

  const item = inputWrap.closest('.item-input');
  const label = item?.querySelector('.item-label')?.textContent?.trim() || input.getAttribute('aria-label') || '材料数量';

  const stepper = document.createElement('span');
  stepper.className = 'number-stepper';
  stepper.append(
    createStepButton(input, label, 'up', 1),
    createStepButton(input, label, 'down', -1)
  );

  input.classList.add('with-stepper');
  inputWrap.dataset.stepperReady = 'true';
  inputWrap.append(stepper);
}

function enhanceAll(root = document) {
  if (root instanceof Element && root.matches(WRAP_SELECTOR)) enhanceInputWrap(root);
  root.querySelectorAll?.(WRAP_SELECTOR).forEach(enhanceInputWrap);
}

enhanceAll();

const observer = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node instanceof Element) enhanceAll(node);
    }
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true });
