/**
 * App Providers
 * Combines all context providers for the application
 */

import { ReactNode } from 'react'
import { MachineProvider } from './MachineContext'
import { FilterProvider } from './FilterContext'
import { UIProvider } from './UIContext'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MachineProvider>
      <FilterProvider>
        <UIProvider>
          {children}
        </UIProvider>
      </FilterProvider>
    </MachineProvider>
  )
}