export interface FormField {
  name: string
  label: string
  value: string
  hint?: string
  type?: 'text' | 'number'
  min?: number
  max?: number
}

/**
 * Modal form built on <dialog>. Resolves with the field values keyed by name,
 * or null if the user cancelled.
 */
export function showForm(
  title: string,
  fields: FormField[],
  okLabel = 'OK'
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'app-dialog'

    const heading = document.createElement('h2')
    heading.textContent = title

    const form = document.createElement('form')
    form.method = 'dialog'

    const inputs = new Map<string, HTMLInputElement>()
    for (const field of fields) {
      const wrapper = document.createElement('label')
      wrapper.className = 'dialog-field'

      const label = document.createElement('span')
      label.textContent = field.label

      const input = document.createElement('input')
      input.type = field.type ?? 'text'
      input.value = field.value
      if (field.min !== undefined) input.min = String(field.min)
      if (field.max !== undefined) input.max = String(field.max)

      wrapper.append(label, input)
      if (field.hint) {
        const hint = document.createElement('small')
        hint.textContent = field.hint
        wrapper.append(hint)
      }
      form.append(wrapper)
      inputs.set(field.name, input)
    }

    const buttons = document.createElement('div')
    buttons.className = 'dialog-buttons'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    const confirm = document.createElement('button')
    confirm.type = 'submit'
    confirm.className = 'primary'
    confirm.textContent = okLabel
    buttons.append(cancel, confirm)
    form.append(buttons)

    dialog.append(heading, form)
    document.body.append(dialog)

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
      const values: Record<string, string> = {}
      for (const [name, input] of inputs) values[name] = input.value
      close(values)
    })

    dialog.showModal()
    inputs.values().next().value?.select()
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

  if (!Number.isInteger(value) || value < 0 || value > 255) return null
  return value
}
