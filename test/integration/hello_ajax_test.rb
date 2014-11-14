require 'test_helper'

class HelloAjaxTest < ActionDispatch::IntegrationTest
  test 'greet' do
    post '/hello_ajax/greet', {name: 'Ivan'}

    assert_response :success
    assert_equal '{"greet":"Joppa Driller greets: Ivan"}', response.body
  end
end