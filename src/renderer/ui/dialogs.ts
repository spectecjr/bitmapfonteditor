import { MAX_CODEPOINT } from '@shared/types'

export interface SelectOption {
  value: string
  label: string
}

export interface FormField {
  name: string
  label: string
  /** Initial value. Unused for 'static' (use `value` there too, just not editable) and 'action'. */
  value: string
  hint?: string
  type?: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'static' | 'action'
  min?: number
  max?: number
  /** textarea only. */
  rows?: number
  /** select only. */
  options?: SelectOption[]
  /** text only — autocomplete suggestions via a <datalist>, e.g. installed font names. */
  list?: string[]
  /** action only — the button's own label. */
  buttonLabel?: string
  /**
   * action only. Returns the text to show under the button afterwards (e.g. the
   * file that got loaded), or null/undefined to leave the hint as it was. Runs
   * on click; a promise is awaited before the button re-enables.
   */
  onAction?: () => string | null | undefined | Promise<string | null | undefined>
}

export interface ShowFormOptions {
  okLabel?: string
  /**
   * Recomputed after every text/number/checkbox/select field changes, and
   * rendered as a persistent note above the buttons — the raw-import dialog
   * uses this for a live "N characters, M bytes each" estimate. Return
   * undefined/null to hide the note.
   */
  onChange?: (values: Record<string, string>) => string | null | undefined
}

/**
 * Modal form built on <dialog>. Resolves with the field values keyed by name
 * (checkboxes as 'true'/'false'; 'static'/'action' fields are display-only and
 * excluded), or null if the user cancelled.
 */
export function showForm(
  title: string,
  fields: FormField[],
  options: ShowFormOptions = {}
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'app-dialog'

    const heading = document.createElement('h2')
    heading.textContent = title

    const form = document.createElement('form')
    form.method = 'dialog'

    const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>()
    let firstFocusable: HTMLElement | null = null

    const currentValues = (): Record<string, string> => {
      const values: Record<string, string> = {}
      for (const [name, input] of inputs) {
        values[name] =
          input instanceof HTMLInputElement && input.type === 'checkbox'
            ? String(input.checked)
            : input.value
      }
      return values
    }

    let note: HTMLParagraphElement | null = null
    const recomputeNote = (): void => {
      if (!options.onChange) return
      const text = options.onChange(currentValues())
      if (!note) {
        note = document.createElement('p')
        note.className = 'dialog-note'
        form.insertBefore(note, form.lastElementChild)
      }
      note.textContent = text ?? ''
      note.style.display = text ? '' : 'none'
    }

    for (const field of fields) {
      const wrapper = document.createElement('label')
      wrapper.className = 'dialog-field'

      const label = document.createElement('span')
      label.textContent = field.label
      wrapper.append(label)

      const hint = field.hint ? document.createElement('small') : null
      if (hint) hint.textContent = field.hint ?? ''

      switch (field.type) {
        case 'static': {
          wrapper.classList.add('dialog-static')
          const value = document.createElement('span')
          value.className = 'dialog-static-value'
          value.textContent = field.value
          wrapper.append(value)
          break
        }

        case 'action': {
          const row = document.createElement('div')
          row.className = 'dialog-action-row'
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = field.buttonLabel ?? field.label
          row.append(button)
          wrapper.append(row)

          button.addEventListener('click', () => {
            void (async () => {
              button.disabled = true
              try {
                const result = await field.onAction?.()
                if (result !== undefined && result !== null && hint) hint.textContent = result
              } finally {
                button.disabled = false
              }
            })()
          })
          firstFocusable ??= button
          break
        }

        case 'checkbox': {
          const input = document.createElement('input')
          input.type = 'checkbox'
          input.checked = field.value === 'true'
          wrapper.classList.add('dialog-checkbox')
          // Checkbox reads better with the label after the box, so rebuild the row.
          wrapper.replaceChildren(input, label)
          inputs.set(field.name, input)
          input.addEventListener('change', recomputeNote)
          firstFocusable ??= input
          break
        }

        case 'select': {
          const select = document.createElement('select')
          for (const option of field.options ?? []) {
            const optionEl = document.createElement('option')
            optionEl.value = option.value
            optionEl.textContent = option.label
            optionEl.selected = option.value === field.value
            select.append(optionEl)
          }
          wrapper.append(select)
          inputs.set(field.name, select)
          select.addEventListener('change', recomputeNote)
          firstFocusable ??= select
          break
        }

        case 'textarea': {
          const textarea = document.createElement('textarea')
          textarea.value = field.value
          textarea.rows = field.rows ?? 4
          wrapper.append(textarea)
          inputs.set(field.name, textarea)
          textarea.addEventListener('input', recomputeNote)
          firstFocusable ??= textarea
          break
        }

        default: {
          const input = document.createElement('input')
          input.type = field.type ?? 'text'
          input.value = field.value
          if (field.min !== undefined) input.min = String(field.min)
          if (field.max !== undefined) input.max = String(field.max)
          if (field.list && field.list.length > 0) {
            const listId = `${field.name}-list`
            const datalist = document.createElement('datalist')
            datalist.id = listId
            for (const item of field.list) {
              const optionEl = document.createElement('option')
              optionEl.value = item
              datalist.append(optionEl)
            }
            input.setAttribute('list', listId)
            wrapper.append(datalist)
          }
          wrapper.append(input)
          inputs.set(field.name, input)
          input.addEventListener('input', recomputeNote)
          firstFocusable ??= input
          break
        }
      }

      if (hint) wrapper.append(hint)
      form.append(wrapper)
    }

    const buttons = document.createElement('div')
    buttons.className = 'dialog-buttons'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    const confirm = document.createElement('button')
    confirm.type = 'submit'
    confirm.className = 'primary'
    confirm.textContent = options.okLabel ?? 'OK'
    buttons.append(cancel, confirm)
    form.append(buttons)

    dialog.append(heading, form)
    document.body.append(dialog)
    recomputeNote()

    const close = (result: Record<string, string> | null): void => {
      dialog.close()
      dialog.remove()
      resolve(result)
    }

    cancel.addEventListener('click', () => close(null))
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      close(null)
    })
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      close(currentValues())
    })

    dialog.showModal()
    if (firstFocusable instanceof HTMLInputElement) firstFocusable.select()
    else firstFocusable?.focus()
  })
}

export function showMessage(title: string, message: string): Promise<boolean> {
  return showConfirm(title, message, 'Close', false)
}

export function showConfirm(
  title: string,
  message: string,
  okLabel = 'OK',
  cancellable = true
): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'app-dialog'

    const heading = document.createElement('h2')
    heading.textContent = title
    const body = document.createElement('p')
    body.textContent = message

    const buttons = document.createElement('div')
    buttons.className = 'dialog-buttons'
    const cancel = document.createElement('button')
    cancel.textContent = 'Cancel'
    const confirm = document.createElement('button')
    confirm.className = 'primary'
    confirm.textContent = okLabel
    if (cancellable) buttons.append(cancel)
    buttons.append(confirm)

    dialog.append(heading, body, buttons)
    document.body.append(dialog)

    const close = (result: boolean): void => {
      dialog.close()
      dialog.remove()
      resolve(result)
    }
    cancel.addEventListener('click', () => close(false))
    confirm.addEventListener('click', () => close(true))
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      close(false)
    })

    dialog.showModal()
    confirm.focus()
  })
}

/** Decimal or `0xNN` hex, for a full Unicode codepoint rather than a font slot 0-255. */
export function parseUnicodeCodepoint(input: string): number | null {
  const text = input.trim()
  if (!text) return null
  const value = /^0x[0-9a-f]+$/i.test(text) ? Number.parseInt(text.slice(2), 16) : Number.parseInt(text, 10)
  if (!/^(0x[0-9a-f]+|\d+)$/i.test(text) || !Number.isInteger(value) || value < 0 || value > MAX_CODEPOINT) return null
  return value
}

export interface MappingDialogResult {
  mode: 'char' | 'code'
  /** Raw text of the Character field — the caller decides how to interpret it based on `mode`. */
  char: string
  /** Raw text of the Character code field — decimal or `0xNN` hex, unvalidated. */
  code: string
}

/**
 * The "what character does this codepoint mean?" dialog — the character can be
 * typed directly, or given as its Unicode codepoint (decimal or `0xNN` hex),
 * whichever is easier to type. A radio button records which one is meant;
 * typing in either field auto-selects its own radio, and neither field is ever
 * disabled, so you can go back and forth before confirming. Validation of the
 * chosen field is the caller's job, the same as every other codepoint entry in
 * this app — this just reports which field the user meant.
 */
export function showMappingDialog(title: string, initialChar: string): Promise<MappingDialogResult | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'app-dialog'

    const heading = document.createElement('h2')
    heading.textContent = title

    const form = document.createElement('form')
    form.method = 'dialog'

    const makeField = (
      radioLabel: string,
      inputValue: string,
      hintText: string
    ): { wrapper: HTMLElement; radio: HTMLInputElement; input: HTMLInputElement } => {
      const wrapper = document.createElement('div')
      wrapper.className = 'dialog-field'
      const radioRow = document.createElement('label')
      radioRow.className = 'dialog-radio-row'
      const radio = document.createElement('input')
      radio.type = 'radio'
      radio.name = 'mapping-mode'
      const radioText = document.createElement('span')
      radioText.textContent = radioLabel
      radioRow.append(radio, radioText)
      const input = document.createElement('input')
      input.type = 'text'
      input.value = inputValue
      const hint = document.createElement('small')
      hint.textContent = hintText
      wrapper.append(radioRow, input, hint)
      input.addEventListener('input', () => {
        radio.checked = true
      })
      return { wrapper, radio, input }
    }

    const charField = makeField(
      'Character',
      initialChar,
      'The Unicode character this codepoint represents. Display only — never exported in the bitmap.'
    )
    const codeField = makeField(
      'Character code',
      initialChar ? String(initialChar.codePointAt(0)) : '',
      'Unicode codepoint of the character: decimal (8364) or hex (0x20AC).'
    )
    charField.radio.checked = true

    form.append(charField.wrapper, codeField.wrapper)

    const buttons = document.createElement('div')
    buttons.className = 'dialog-buttons'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    const confirm = document.createElement('button')
    confirm.type = 'submit'
    confirm.className = 'primary'
    confirm.textContent = 'OK'
    buttons.append(cancel, confirm)
    form.append(buttons)

    dialog.append(heading, form)
    document.body.append(dialog)

    const close = (result: MappingDialogResult | null): void => {
      dialog.close()
      dialog.remove()
      resolve(result)
    }

    cancel.addEventListener('click', () => close(null))
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      close(null)
    })
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      close({
        mode: codeField.radio.checked ? 'code' : 'char',
        char: charField.input.value,
        code: codeField.input.value
      })
    })

    dialog.showModal()
    charField.input.select()
  })
}

/** Accepts `65`, `0x41`, `$41`, or a bare character like `A`. */
export function parseCodepoint(input: string): number | null {
  const text = input.trim()
  if (!text) return null

  let value: number
  if (/^0x[0-9a-f]+$/i.test(text)) value = Number.parseInt(text.slice(2), 16)
  else if (/^\$[0-9a-f]+$/i.test(text)) value = Number.parseInt(text.slice(1), 16)
  else if (/^\d+$/.test(text)) value = Number.parseInt(text, 10)
  else if ([...text].length === 1) value = text.codePointAt(0)!
  else return null

  if (!Number.isInteger(value) || value < 0 || value > MAX_CODEPOINT) return null
  return value
}
