module.exports = {
    root: true,
    env: { browser: true, es2020: true },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react/recommended', // Added basic React rules
        'plugin:react-hooks/recommended',
        'plugin:jsx-a11y/recommended', // Accessibility rules
        'plugin:prettier/recommended', // Integrates Prettier with ESLint
    ],
    ignorePatterns: ['dist', '.eslintrc.cjs', 'vite.config.ts'], // Ignore build output and config files
    parser: '@typescript-eslint/parser',
    plugins: [
        'react-refresh',
        '@typescript-eslint',
        'react',
        'jsx-a11y'
    ],
    rules: {
        'prettier/prettier': 'warn', // Show Prettier issues as warnings
        'react-refresh/only-export-components': [
            'warn',
            { allowConstantExport: true },
        ],
        '@typescript-eslint/no-unused-vars': [
            'warn',
            { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }, // Allow unused vars/args starting with _
        ],
        '@typescript-eslint/no-explicit-any': 'warn', // Warn about using 'any'
        'react/prop-types': 'off', // Not needed with TypeScript
        'react/react-in-jsx-scope': 'off', // Not needed with React 17+
        // Add any other specific rule overrides here
    },
    settings: {
        react: {
            version: 'detect', // Automatically detect React version
        },
    },
}; 