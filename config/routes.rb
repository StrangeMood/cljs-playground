Rails.application.routes.draw do
  get '/hello_world', to: 'application#hello_world'

  get '/hello_ajax', to: 'hello_ajax#index'
  post '/hello_ajax/greet', to: 'hello_ajax#greet'
end
